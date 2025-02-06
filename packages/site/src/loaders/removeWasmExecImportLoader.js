module.exports = function (source) {
  return source.replace("import '../wasm/wasm_exec.js';", '');
};
