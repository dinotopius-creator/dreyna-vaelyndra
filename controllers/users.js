let users = [];
let idCounter = 1;

exports.listUsers = (req, res) => res.json(users);

exports.getUser = (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user);
};

exports.createUser = (req, res) => {
  const user = { id: idCounter++, ...req.body };
  users.push(user);
  res.status(201).json(user);
};

exports.updateUser = (req, res) => {
  const idx = users.findIndex(u => u.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  users[idx] = { ...users[idx], ...req.body };
  res.json(users[idx]);
};

exports.deleteUser = (req, res) => {
  const idx = users.findIndex(u => u.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  users.splice(idx,1);
  res.status(204).end();
};