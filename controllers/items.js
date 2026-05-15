let items = [];
let idCounter = 1;

exports.listItems = (req, res) => res.json(items);

exports.getItem = (req, res) => {
  const item = items.find(i => i.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
};

exports.createItem = (req, res) => {
  const item = { id: idCounter++, ...req.body };
  items.push(item);
  res.status(201).json(item);
};

exports.updateItem = (req, res) => {
  const idx = items.findIndex(i => i.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  items[idx] = { ...items[idx], ...req.body };
  res.json(items[idx]);
};

exports.deleteItem = (req, res) => {
  const idx = items.findIndex(i => i.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  items.splice(idx,1);
  res.status(204).end();
};