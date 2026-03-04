import {initWebGPU, createShaderModuleFromSource, clamp, createNGon} from './my_lib.js';

/* 1) init webgpu */
const {device, canvas, context, presentationFormat: canvasPreferredFormat} = await initWebGPU("my_canvas");

/* 2) init render shader module */
const renderShaderModule = await createShaderModuleFromSource(device, 'dots_and_lines', "dots and lines");

/* 3) init render pipeline */
const vertexBufferLayouts : Array<GPUVertexBufferLayout> = [
    {
        // position
        attributes: [{shaderLocation: 0, offset: 0, format: "float32x2"}],
        arrayStride: 2 * 4,
        stepMode: "vertex",
    },
];
const renderDotsPipelineDescriptor : GPURenderPipelineDescriptor = {
    layout: 'auto',
    vertex: {
        module: renderShaderModule,
        entryPoint: 'vs_dots',
        buffers: vertexBufferLayouts,
    },
    fragment: {
        module: renderShaderModule,
        entryPoint: 'fs',
        targets: [{format: canvasPreferredFormat}]
    },
    primitive: {
        topology: "triangle-list",
    },
    multisample: {
        count: 4,
    },
};
const renderDotsPipeline = device.createRenderPipeline(renderDotsPipelineDescriptor);

const renderLinesPipelineDescriptor : GPURenderPipelineDescriptor = {
    layout: 'auto',
    vertex: {
        module: renderShaderModule,
        entryPoint: 'vs_lines',
    },
    fragment: {
        module: renderShaderModule,
        entryPoint: 'fs',
        targets: [{format: canvasPreferredFormat}]
    },
    primitive: {
        topology: "triangle-list",
    },
    multisample: {
        count: 4,
    },
};
const renderEdgesPipeline = device.createRenderPipeline(renderLinesPipelineDescriptor);

/* 4) Create and pass vertex data to GPU */
/* 4.1) Position vertex data */
const dotTriangulation = createNGon(0.02,20);
const vertexPositionData = new Float32Array([...dotTriangulation]);
const vertexPositionBufferDescriptor : GPUBufferDescriptor = {
    size: vertexPositionData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
};
const vertexPositionBuffer = device.createBuffer(vertexPositionBufferDescriptor);
device.queue.writeBuffer(vertexPositionBuffer, 0, vertexPositionData);

/* 5) Create and pass storage data to GPU */
/* 5.1) cell data, i.e. the grid positions */
const rowCount = 10;
const colCount = 10;
const nodeCount = rowCount * colCount;
const dxdcol = 2.0 / (colCount+1);
const dydrow = 2.0 / (rowCount+1);
const xOffset = dxdcol - 1.0;
const yOffset = dydrow - 1.0;
const cellEntrophy = 2;
const cellStorageData = new Float32Array(cellEntrophy * nodeCount);
let cellStorageDataIndex = 0;
for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < colCount; col++) {
        const x = dxdcol * col + xOffset;
        const y = dydrow * row + yOffset;
        cellStorageData.set([x, y], cellStorageDataIndex);
        cellStorageDataIndex += cellEntrophy;
    }
}
const cellStorageBuffer = device.createBuffer({
    size: cellStorageData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(cellStorageBuffer, 0, cellStorageData);
/* 5.2) Dynamic data */
var edgeStorageData = new Int32Array([1,1]);
// needs to be made dynamic at some point
var edgeStorageBuffer = device.createBuffer({
    size: edgeStorageData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(edgeStorageBuffer, 0, edgeStorageData);

/* 6) Camera stuff */
const camera = {
    infos: {
            worldPos : [0.0, 0.0],
            focalLength: 1.0,
            padding: 0.0,
            selectedNodes: [-1, -1],
    },
    buffer: {} as GPUBuffer,
    getBufferData: function() : GPUAllowSharedBufferSource{
        const length = Object.values(this.infos).flat().length;
        const result = new ArrayBuffer(length * 4);
        const float32View = new Float32Array(result);
        const int32View = new Int32Array(result);
        float32View.set(Object.values(this.infos).flat(), 0);
        int32View.set(this.infos.selectedNodes, 4);
        return result;
        //return new ArrayBuffer(Object.values(this.infos).flat() as Array<number>);
    }
}
camera.buffer = device.createBuffer({
    label: 'camera-uniform-buffer',
    size: camera.getBufferData().byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(camera.buffer, 0, camera.getBufferData());

var mouseIsDown : boolean = false;
var cursorDownClipPos = [...camera.infos.worldPos];

/* 7) Setting up bind groups */
/* 7.1 for "render dots" program */
const bindGroup0RenderDots = device.createBindGroup({
    label: "bind-group-0-dots",
    layout: renderDotsPipeline.getBindGroupLayout(0),
    entries: [
        {
            binding: 0,
            resource: {buffer: cellStorageBuffer}
        }
    ]
});
const bindGroup1RenderDots = device.createBindGroup({
    label: "bind-group-1-dots",
    layout: renderDotsPipeline.getBindGroupLayout(1),
    entries: [
        {
            binding: 0,
            resource: {buffer: camera.buffer}
        }
    ]
});

/* 7.2 for "render lines" program */
const bindGroup0RenderEdges = device.createBindGroup({
    label: "bind-group-0-lines",
    layout: renderEdgesPipeline.getBindGroupLayout(0),
    entries: [
        {
            binding: 0,
            resource: {buffer: cellStorageBuffer}
        }
    ]
});
const bindGroup1RenderEdges = device.createBindGroup({
    label: "bind-group-1-lines",
    layout: renderEdgesPipeline.getBindGroupLayout(1),
    entries: [
        {
            binding: 0,
            resource: {buffer: camera.buffer}
        }
    ]
});
var bindGroup2RenderEdgesDynamic = device.createBindGroup({
    label: "bind-group-2-lines",
    layout: renderEdgesPipeline.getBindGroupLayout(2),
    entries: [
        {
            binding: 0,
            resource: {buffer: edgeStorageBuffer}
        }
    ]
});

/* 8) Event listening */
canvas.addEventListener("mousedown", (event) => {
    mouseIsDown = true;
    const mouseClipX = event.clientX / canvas.width * 2 - 1;
    const mouseClipY = 1 - event.clientY / canvas.height * 2;
    if (event.shiftKey) {
        cursorDownClipPos = [mouseClipX, mouseClipY];
    } else {
        const cursorWorldX = 1 * camera.infos.focalLength * mouseClipX + camera.infos.worldPos[0];
        const cursorWorldY = 1 * camera.infos.focalLength * mouseClipY + camera.infos.worldPos[1];


        console.log(camera.infos.focalLength);
        // x = offset + width * col
        // y = offset + height * row
        const col = clamp(0, colCount, Math.round((cursorWorldX - xOffset) / dxdcol));
        const row = clamp(0, rowCount,Math.round((cursorWorldY - yOffset) / dydrow));
        const selectedNode = (colCount * row + col);

        let emptySeat = camera.infos.selectedNodes.findIndex((element) => element == -1);
        /* Assertion: beforehand, the current selected nodes should have at least one empty slot - i.e. a -1 */
        
        let idxOfNode = camera.infos.selectedNodes.findIndex((element) => element == selectedNode);
        if (idxOfNode == -1) {
            /* If the newly selected node is not included, then it replaces an empty slot. */
            console.log("node occupying seat");
            camera.infos.selectedNodes[emptySeat] = selectedNode;
        } else {
            /* If the newly selected node is included in the currenet selected nodes, then that node should instead be removed from the current selected nodes, so that its slot becomes a -1 */
            console.log("node was removed from seat");
            camera.infos.selectedNodes[idxOfNode] = -1;
        }

        console.log(camera.infos.selectedNodes, camera.getBufferData());

        emptySeat = camera.infos.selectedNodes.findIndex((element) => element == -1);
        if (emptySeat == -1) {
            console.log("both slots are occupied, emptying seats.")
            /* If both slots are non-empty, then the selected nodes should be added to the edges buffer */
            edgeStorageData = new Int32Array([...edgeStorageData,...camera.infos.selectedNodes]);
            console.log(edgeStorageData);
            edgeStorageBuffer = device.createBuffer({
                size: edgeStorageData.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(edgeStorageBuffer, 0, edgeStorageData);
            bindGroup2RenderEdgesDynamic = device.createBindGroup({
                label: "bind-group-2-lines",
                layout: renderEdgesPipeline.getBindGroupLayout(2),
                entries: [
                    {
                        binding: 0,
                        resource: {buffer: edgeStorageBuffer}
                    }
                ]
            });

            camera.infos.selectedNodes = [-1, -1];
        }
    }
});
canvas.addEventListener("mouseup", (event) => {
    mouseIsDown = false;
});
canvas.addEventListener("mousemove", (event) => {
    if (mouseIsDown && event.shiftKey) {
        // calculate world position of cursor
        const mouseClipX = event.clientX / canvas.width * 2 - 1;
        const mouseClipY = 1 - event.clientY / canvas.height * 2;
        const cursorWorldChangeX = camera.infos.focalLength * (mouseClipX - cursorDownClipPos[0]);
        const cursorWorldChangeY = camera.infos.focalLength * (mouseClipY - cursorDownClipPos[1]);
        // change camera position
        camera.infos.worldPos[0] = clamp(1 - 1/camera.infos.focalLength, 1/camera.infos.focalLength - 1, camera.infos.worldPos[0] - cursorWorldChangeX);
        camera.infos.worldPos[1] = clamp(1 - 1/camera.infos.focalLength, 1/camera.infos.focalLength - 1, camera.infos.worldPos[1] - cursorWorldChangeY);
    }
});
canvas.addEventListener("wheel", (event) => {
    if (event.shiftKey) {
        var scrollAmount = event.deltaY;
        if (scrollAmount == 0) {
            scrollAmount = event.deltaX;
        }
        camera.infos.focalLength = clamp(0.1, 1.0, camera.infos.focalLength + scrollAmount / 120);
        camera.infos.worldPos[0] = clamp(1 - 1/camera.infos.focalLength, 1/camera.infos.focalLength - 1, camera.infos.worldPos[0]);
        camera.infos.worldPos[1] = clamp(1 - 1/camera.infos.focalLength, 1/camera.infos.focalLength - 1, camera.infos.worldPos[1]);
    }
});




/* final step) Start render pass */
let multisampleTexture : GPUTexture | undefined;
requestAnimationFrame(render);
const observer = new ResizeObserver( entries => {
    for (const entry of entries) {
        const canvas = entry.target as HTMLCanvasElement;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }
});
observer.observe(canvas);
function render() {
    /* Dynamic buffer data */
    device.queue.writeBuffer(camera.buffer,0,camera.getBufferData());

    const canvasTexture = context.getCurrentTexture();
    if (multisampleTexture) {
        multisampleTexture.destroy();
    }
    multisampleTexture = device.createTexture({
        format: canvasTexture.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        size: [canvasTexture.width, canvasTexture.height],
        sampleCount: 4
    });
    const renderPassDescriptor : GPURenderPassDescriptor = {
        colorAttachments: [{
            view: multisampleTexture.createView(),
            resolveTarget: canvasTexture.createView(),
            clearValue: [0.9,0.9,0.9,1.0],
            loadOp: 'clear',
            storeOp: 'store'
        }]
    };
    const renderCommandEncoder = device.createCommandEncoder();

    //@ts-ignore
    //render dots
    renderPassDescriptor.colorAttachments[0].loadOp = "clear";
    let renderPassEncoder = renderCommandEncoder.beginRenderPass(renderPassDescriptor);
    renderPassEncoder.setPipeline(renderDotsPipeline);
    renderPassEncoder.setBindGroup(0, bindGroup0RenderDots);
    renderPassEncoder.setBindGroup(1, bindGroup1RenderDots);
    renderPassEncoder.setVertexBuffer(0, vertexPositionBuffer);
    renderPassEncoder.draw(dotTriangulation.length / 2, nodeCount);
    renderPassEncoder.end();

    //@ts-ignore
    //render edges
    renderPassDescriptor.colorAttachments[0].loadOp = "load";
    renderPassEncoder = renderCommandEncoder.beginRenderPass(renderPassDescriptor);
    renderPassEncoder.setPipeline(renderEdgesPipeline);
    renderPassEncoder.setBindGroup(0, bindGroup0RenderEdges);
    renderPassEncoder.setBindGroup(1, bindGroup1RenderEdges);
    renderPassEncoder.setBindGroup(2, bindGroup2RenderEdgesDynamic);
    renderPassEncoder.draw(2 * 3, edgeStorageData.length / 2);
    renderPassEncoder.end();

    device.queue.submit([renderCommandEncoder.finish()]);
    requestAnimationFrame(render);
}
