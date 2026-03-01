

struct StaticVertexStruct {
    @location(0) position : vec2f
};

struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f
};

struct NodeStruct {
    pos: vec2f,
    selected: f32,
    padding: f32
};

struct CameraStruct {
    worldPos : vec2f,
    focalLength: f32,
    padding: f32
};

@group(0) @binding(0) var<uniform> camera : CameraStruct;
@group(0) @binding(1) var<storage, read> nodeArray : array<NodeStruct>;

@vertex fn vs(vert : StaticVertexStruct, @builtin(instance_index) instanceIndex : u32) -> VSOutput {
    const defaultColor = vec4f(0.7,0.7,0.7,1.0);
    const selectColor = vec4f(0.0,0.0,1.0,1.0);

    var vsOut : VSOutput;
    var node = nodeArray[instanceIndex];
    vsOut.position = vec4f(vert.position - camera.worldPos + 1.0 / camera.focalLength * node.pos, 0.0, 1.0);
    if node.selected > 0 {
        vsOut.color = selectColor;
    } else {
        vsOut.color = defaultColor;
    }
    return vsOut;
}

@fragment fn fs(fsInput : VSOutput) -> @location(0) vec4f {
    return fsInput.color;
}

