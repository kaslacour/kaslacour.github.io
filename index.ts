import * as my_lib from "./my_lib.js";

main();
async function main(){
    const canvas_id = "my_canvas";
    const program_name = "moving_around";
    const shader_source_relative_path = "move_shader";
    const {device, canvas, context, presentationFormat} = await my_lib.setupWebGPU(canvas_id);
    const module = await my_lib.createShaderModuleFromSource(device,shader_source_relative_path, program_name);
    
    const renderPipeline = device.createRenderPipeline({
        layout: 'auto',
        label: `${program_name}-render-pipeline`,
        vertex: {
            module: module,
            entryPoint: 'vs',
            buffers: [
                {
                    arrayStride: 2 * 4, // bytes
                    attributes: [{shaderLocation: 0, offset: 0, format: 'float32x2'}]
                }
            ],
        },
        fragment: {
            module: module,
            entryPoint: 'fs',
            targets: [{format: presentationFormat}]
        },
        multisample: {
            count: 4
        }
    });

    /* Uniform buffer stuff : camera stuff*/
    const cameraBufferByteLength = 4 * 4;
    const cameraBufferData = new Float32Array(cameraBufferByteLength / 4);
    const cameraPosByteOffset = 0;
    const cameraFocalLengthByteOffset = 2 * 4;
    const cameraWorldPos = [0.0, 0.0];
    var cameraFocalLength = 1.0;
    const cameraBuffer = device.createBuffer({
        label: 'camera-uniform-buffer',
        size: cameraBufferByteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    cameraBufferData.set(cameraWorldPos, cameraPosByteOffset / 4);
    cameraBufferData.set([cameraFocalLength], cameraFocalLengthByteOffset / 4);
    device.queue.writeBuffer(cameraBuffer,0,cameraBufferData);

    var mouseIsDown : boolean = false;
    var shiftKeyIsDown : boolean = false;
    var cursorDownClipPos = [...cameraWorldPos];

    /* Node buffer stuff */
    const colCount = 30;
    const rowCount = 30;
    const cellCount = colCount * rowCount;
    const cellByteSize = (2 + 1 + 1) * 4;
    const nodePosByteOffset = 0;
    const nodeSelectByteOffset = 2 * 4;
    const nodeBufferData = new Float32Array(cellCount * cellByteSize / 4);

    const cellWidth = 1/(colCount + 1) * 2.0; 
    const cellHeight = 1/(rowCount + 1) * 2.0;
    const xOffset = cellWidth - 1.0;
    const yOffset = cellHeight - 1.0;
    /*
    const cellArray = new Array(rowCount);
    for (let row = 0; row < rowCount; row++) {
        cellArray[row] = new Array(colCount);
        for (let col = 0; col < colCount; col++) {
            cellArray[row][col] = new Array(2);
        }
    }
    */

    var gridIndex = 0;
    for (let row = 0; row < rowCount; row++) {
        for (let col = 0; col < colCount; col++) {
            let x = col * cellWidth + xOffset;
            let y = row * cellHeight + yOffset;
            //cellArray[row][col] = [x,y];
            nodeBufferData.set([x, y], gridIndex + nodePosByteOffset / 4);
            nodeBufferData.set([0], gridIndex + nodeSelectByteOffset / 4);
            gridIndex += cellByteSize / 4;
        }
    }

    const storageBuffer = device.createBuffer({
        label: "storage-buffer",
        size: nodeBufferData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(storageBuffer, 0, nodeBufferData);

    /* Vertex buffer stuff */
    const vertexData = createNGon(0.01, 50);
    const vertexCount = vertexData.length / 2;
    const vertexBuffer = device.createBuffer({
        label: 'vertex-buffer',
        size: vertexData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertexData);

    /* Bind groups */
    const bindGroup = device.createBindGroup({
        label: 'bind-group-for-vertex-and-uniform-buffers',
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: {buffer: cameraBuffer}},
            {binding: 1, resource: {buffer: storageBuffer}}
        ]
    });

    /* Event listening */
    canvas.addEventListener("mousedown", (event) => {
        mouseIsDown = true;
        const mouseClipX = event.clientX / canvas.width * 2 - 1;
        const mouseClipY = 1 - event.clientY / canvas.height * 2;
        if (event.shiftKey) {
            cursorDownClipPos = [mouseClipX, mouseClipY];
        } else {
            const cursorWorldX = 1 / cameraFocalLength * mouseClipX + cameraWorldPos[0];
            const cursorWorldY = 1 / cameraFocalLength * mouseClipY + cameraWorldPos[1];

            // x = offset + width * col
            // y = offset + height * row
            const col = clamp(0, colCount, Math.round((cursorWorldX - xOffset) / cellWidth));
            const row = clamp(0,rowCount,Math.round((cursorWorldY - yOffset) / cellHeight));

            const bufferIndex = (colCount * row + col) * cellByteSize + nodeSelectByteOffset;
            const selectNode = nodeBufferData[bufferIndex / 4];
            nodeBufferData.set([(selectNode + 1) % 2], bufferIndex / 4);
            device.queue.writeBuffer(storageBuffer, 0, nodeBufferData);
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
            const cursorWorldChangeX = cameraFocalLength * (mouseClipX - cursorDownClipPos[0]);
            const cursorWorldChangeY = cameraFocalLength * (mouseClipY - cursorDownClipPos[1]);
            // change camera position
            cameraWorldPos[0] = clamp(1 - 1/cameraFocalLength, 1/cameraFocalLength - 1, cameraWorldPos[0] - cursorWorldChangeX);
            cameraWorldPos[1] = clamp(1 - 1/cameraFocalLength, 1/cameraFocalLength - 1, cameraWorldPos[1] - cursorWorldChangeY);
        }
    });
    canvas.addEventListener("wheel", (event) => {
        if (event.shiftKey) {
            var scrollAmount = event.deltaY;
            if (scrollAmount == 0) {
                scrollAmount = event.deltaX;
            }
            cameraFocalLength = clamp(0.1, 1.0, cameraFocalLength + scrollAmount / 120);
            cameraWorldPos[0] = clamp(1 - 1/cameraFocalLength, 1/cameraFocalLength - 1, cameraWorldPos[0]);
            cameraWorldPos[1] = clamp(1 - 1/cameraFocalLength, 1/cameraFocalLength - 1, cameraWorldPos[1]);
        }
    });


    /* Rendering and stuff */
    const renderPassDescriptor = {
        label: `${program_name}-render-pass-descriptor`,
        colorAttachments: [
            {
                view: {} as GPUTextureView,
                resolveTarget: {} as GPUTextureView,
                clearValue: [0.9,0.9,0.9,1.0],
                loadOp: 'clear',
                storeOp: 'store'
            }
        ]
    };
    let multisampleTexture : GPUTexture;
    requestAnimationFrame(render);
    const observer = new ResizeObserver( entries => {
        for (const entry of entries) {
            const canvas = entry.target as HTMLCanvasElement;
            const rect = canvas.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            canvas.width = width;
            canvas.height = height;
            //canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D))
            //canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D))
        }
    });
    observer.observe(canvas);
    function render(now : number) {
        cameraBufferData.set(cameraWorldPos, cameraPosByteOffset / 4);
        cameraBufferData.set([cameraFocalLength], cameraFocalLengthByteOffset / 4);
        device.queue.writeBuffer(cameraBuffer,0,cameraBufferData);

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
        renderPassDescriptor.colorAttachments[0].view = multisampleTexture.createView();
        renderPassDescriptor.colorAttachments[0].resolveTarget = canvasTexture.createView();
        const commandEncoder = device.createCommandEncoder()

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor as GPURenderPassDescriptor);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.setVertexBuffer(0, vertexBuffer);
        passEncoder.setPipeline(renderPipeline);
        passEncoder.draw(vertexCount,cellCount);
        passEncoder.end();

        const commandBuffer = commandEncoder.finish();
        device.queue.submit([commandBuffer]);
        requestAnimationFrame(render);
    }
}


function createNGon(radius : number, n : number){
    var nGonVertices : Array<number[]> = [];
    for (let i = 0; i < n; i++) {
        let angle = 2 * Math.PI * i / n;
        let x = Math.cos(angle) * radius;
        let y = Math.sin(angle) * radius;
        nGonVertices.push([x,y]);
    }
    const triangulationVertices = new Float32Array(3 * 2 * n);
    var j = 0;
    for (let i = 0; i < n; i++) {
        triangulationVertices.set(nGonVertices[i],j);
        triangulationVertices.set(nGonVertices[(i+1) % n],j+2);
        triangulationVertices.set([0.0,0.0],j+4);
        j+=6;
    }
    return triangulationVertices;
}

function clamp(min: number, max : number, val : number) {
    return Math.min(max, Math.max(min, val));

    // clamp(-1, 1, 0) = min(1, max(-1, 0) ) = 0
}