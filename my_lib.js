export async function setupWebGPU(canvas_id) {
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
    const { device, canvas, context, presentationFormat } = await setupWebGPU(canvas_id);
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