@group(0) @binding(0) var<storage, read_write> data: array<f32>;

@compute @workgroup_size(1)
fn computeMain(@builtin(global_invocation_id) globalId: vec3u) {
  let i = globalId.x;
  data[i] = f32(i);
}
