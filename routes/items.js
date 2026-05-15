const express = require('express');
const router = express.Router();
const itemsController = require('../controllers/items');

router.get('/', itemsController.listItems);
router.get('/:id', itemsController.getItem);
router.post('/', itemsController.createItem);
router.put('/:id', itemsController.updateItem);
router.delete('/:id', itemsController.deleteItem);

module.exports = router;