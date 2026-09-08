/** glTF 2.0 / GLB exporter for non-indexed position-normal-color geometry. */
function exportGeometryGLB(meshes, metadata = {}) {
    const gltf = { asset: { version: '2.0', generator: 'Orbis Townsmith', extras: metadata }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [{ name: 'Matte vertex colors', doubleSided: true, pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 } }], buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [] };
    const chunks = [];
    let offset = 0;
    for (const [name, m] of Object.entries(meshes)) {
        if (!m.vertices?.length || name === 'selectedLot')
            continue;
        const data = new Float32Array(m.vertices), count = data.length / 9, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        if (count % 3 !== 0)
            throw Error('Invalid triangle count in GLB export.');
        for (let k = 0; k < data.length; k += 9) {
            for (let a = 0; a < 3; a++) {
                if (!Number.isFinite(data[k + a]))
                    throw Error('Nonfinite geometry.');
                min[a] = Math.min(min[a], data[k + a]);
                max[a] = Math.max(max[a], data[k + a]);
                data[k + a + 6] = Math.pow(clamp(data[k + a + 6]), 2.2);
            }
        }
        const vi = gltf.bufferViews.length;
        gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.byteLength, byteStride: 36, target: 34962 });
        offset += data.byteLength;
        chunks.push(new Uint8Array(data.buffer));
        const ai = gltf.accessors.length;
        gltf.accessors.push({ bufferView: vi, byteOffset: 0, componentType: 5126, count, type: 'VEC3', min, max }, { bufferView: vi, byteOffset: 12, componentType: 5126, count, type: 'VEC3' }, { bufferView: vi, byteOffset: 24, componentType: 5126, count, type: 'VEC3' });
        const id = gltf.meshes.length;
        gltf.meshes.push({ name, primitives: [{ attributes: { POSITION: ai, NORMAL: ai + 1, COLOR_0: ai + 2 }, mode: 4, material: 0 }] });
        gltf.nodes.push({ name, mesh: id });
        gltf.scenes[0].nodes.push(id);
    }
    gltf.buffers[0].byteLength = offset;
    const json = new TextEncoder().encode(JSON.stringify(gltf)), jlen = Math.ceil(json.length / 4) * 4, total = 28 + jlen + offset, buffer = new ArrayBuffer(total), dv = new DataView(buffer), bytes = new Uint8Array(buffer);
    dv.setUint32(0, 0x46546c67, true);
    dv.setUint32(4, 2, true);
    dv.setUint32(8, total, true);
    dv.setUint32(12, jlen, true);
    dv.setUint32(16, 0x4e4f534a, true);
    bytes.fill(32, 20, 20 + jlen);
    bytes.set(json, 20);
    dv.setUint32(20 + jlen, offset, true);
    dv.setUint32(24 + jlen, 0x004e4942, true);
    let pos = 28 + jlen;
    for (const c of chunks) {
        bytes.set(c, pos);
        pos += c.length;
    }
    return buffer;
}
