export async function initWebGPU(canvas_id) {
    /* GPU */
    const adapter = await navigator.gpu?.requestAdapter();
    /* "device" */
    const device = await adapter?.requestDevice();
    if (!device) {
        console.error("Browser does not support WebGPU.");
    }
    const canvas = document.getElementById(canvas_id);
    /* "Texture" to render to */
    const context = canvas.getContext("webgpu");
    /* rgba8unorm or bgra8unorm */
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: presentationFormat,
    });
    return { device, canvas, context, presentationFormat };
}
export async function createShaderModuleFromSource(device, shader_source_relative_path, name_of_program) {
    /* Create shader module */
    const vshader_code = await fetch(`../src/shaders/${shader_source_relative_path}.wgsl`).then(r => r.text());
    const shader_module = device.createShaderModule({
        label: `${name_of_program}-shader-module`,
        code: vshader_code
    });
    console.log(vshader_code);
    return shader_module;
}
export async function runSimpleRenderProgram(canvas_id, module_relative_path, name_of_shader_program) {
    /* Retrieve graphical and WebGPU stuff */
    const { device, canvas, context, presentationFormat } = await initWebGPU(canvas_id);
    /* Setup shader module */
    const rgbTriangleShaderModule = await createShaderModuleFromSource(device, `../src/shaders/${module_relative_path}.wgsl`, `${name_of_shader_program}-shader-module`);
    /* Setup render pipeline */
    const renderPipeline = device.createRenderPipeline({
        label: `${name_of_shader_program}-render-pipeline`,
        layout: "auto",
        vertex: {
            module: rgbTriangleShaderModule,
            entryPoint: "vs"
        },
        fragment: {
            module: rgbTriangleShaderModule,
            entryPoint: "fs",
            targets: [{ format: presentationFormat }]
        }
    });
    /* Setup render pass descriptor */
    const renderPassDescriptor = {
        label: `${name_of_shader_program}-render-pass-descriptor`,
        colorAttachments: [{
                view: {},
                clearValue: [0.3, 0.3, 0.3, 1.0], //rgba
                loadOp: 'clear',
                storeOp: 'store',
            }]
    };
    /* Start render pass */
    render();
    /* Function for observing and changing canvas size and resolution */
    const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
            const canvas = entry.target;
            const width = entry.contentBoxSize[0].inlineSize;
            const height = entry.contentBoxSize[0].blockSize;
            canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
            canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
        }
        render();
    });
    /* Re-render when canvas changes in size */
    observer.observe(canvas);
    function render() {
        renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();
        const encoder = device.createCommandEncoder({
            label: `${name_of_shader_program}-command-encoder`
        });
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(renderPipeline);
        pass.draw(3);
        pass.end();
        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
    }
}
export function createRectangle(length, width) {
    return new Float32Array([
        -width / 2.0, -length / 2.0,
        width / 2.0, -length / 2.0,
        width / 2.0, length / 2.0,
        -width / 2.0, -length / 2.0,
        -width / 2.0, length / 2.0,
        width / 2.0, length / 2.0,
    ]);
}
export function createNGon(radius, n) {
    var nGonVertices = [];
    for (let i = 0; i < n; i++) {
        let angle = 2 * Math.PI * i / n;
        let x = Math.cos(angle) * radius;
        let y = Math.sin(angle) * radius;
        nGonVertices.push([x, y]);
    }
    const triangulationVertices = new Float32Array(3 * 2 * n);
    var j = 0;
    for (let i = 0; i < n; i++) {
        triangulationVertices.set(nGonVertices[i], j);
        triangulationVertices.set(nGonVertices[(i + 1) % n], j + 2);
        triangulationVertices.set([0.0, 0.0], j + 4);
        j += 6;
    }
    return triangulationVertices;
}
export function clamp(min, max, val) {
    return Math.min(max, Math.max(min, val));
    // clamp(-1, 1, 0) = min(1, max(-1, 0) ) = 0
}
/*
const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
        const canvas = entry.target as HTMLCanvasElement;
        const width = entry.contentBoxSize[0].inlineSize;
        const height = entry.contentBoxSize[0].blockSize;
        canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D))
        canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D))
    }
    render();
});
*/ 
//# sourceMappingURL=my_lib.js.map