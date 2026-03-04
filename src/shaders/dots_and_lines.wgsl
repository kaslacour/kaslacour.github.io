override pi : f32 = 3.14159265;

// f32 : 32 bits = 4 * 8 bits = 4 bytes
struct Camera {
    worldPos : vec2f,
    focalLength: f32,
    padding: f32,
    selectedNodes: vec2i,
}

struct Cell {
    position : vec2f,
}

struct Edge {
    nodes : array<u32,2>,
}

struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
}

/* Variables */
@group(0) @binding(0) var<storage, read> cells: array<Cell>;
@group(1) @binding(0) var<uniform> camera : Camera;
@group(2) @binding(0) var<storage, read> edges : array<Edge>;
const selectedColor = vec4(0.0,0.0,1.0,1.0);
const unselectedColor = vec4(0.7,0.7,0.7,1.0);
const edgeColor = vec4(0.0, 1.0, 0.0, 1.0);

@vertex fn vs_dots(
    @builtin(vertex_index) vertex_index : u32, 
    @builtin(instance_index) instance_index : u32,
    @location(0) position : vec2f,
    ) -> VSOutput
{
    var out : VSOutput;
    var cell_id : i32 = i32(instance_index);
    var cell : Cell = cells[instance_index];
    out.position = getCameraPosition(position + cell.position);

    if (any(camera.selectedNodes == vec2i(cell_id,cell_id))) {
        out.color = selectedColor;
    } else {
        out.color = unselectedColor;
    }

    //out.color = select(unselectedColor, selectedColor, any(camera.selectedNodes == vec2i(bitcast<i32>(instance_index),bitcast<i32>(instance_index))));
    return out;
}

@vertex fn vs_lines(
    @builtin(vertex_index) vertex_index : u32, 
    @builtin(instance_index) instance_index : u32,
    ) -> VSOutput
{
    var out : VSOutput;
    var edge = edges[instance_index];
    var p : vec2f = cells[edge.nodes[0]].position;
    var q : vec2f = cells[edge.nodes[1]].position;
    var pq : vec2f = q - p;
    var theta : f32 = atan2(pq.y, pq.x) + pi / 2.0;
    var n : vec2f = vec2f(cos(theta),sin(theta));
    var offset : vec2f = 0.005*n;

    var quad = array<vec2f,6>(
        p + offset, p - offset, q - offset,

        q - offset, q + offset, p + offset
    );
    out.position = getCameraPosition(quad[vertex_index]);
    out.color = edgeColor;
    return out;
}


@fragment fn fs(frag_data : VSOutput) -> @location(0) vec4f {
    return frag_data.color;
}

fn getCameraPosition(pos : vec2f) -> vec4f {
    return vec4f(pos - camera.worldPos, 0.0, camera.focalLength);
}