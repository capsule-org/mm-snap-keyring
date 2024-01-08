module.exports = function (source) {
  return source.replace('import"./css/modal.css";', '');
};
