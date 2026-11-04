const express = require('express');
const User = require('../models/user');
const Task = require('../models/task');
const h = require('./helpers');

const router = express.Router();

router.get('/', (req, res) => h.listHandler(User, req, res, undefined));
router.post('/', (req, res) => saveUser(req, res, null));
router.get('/:id', (req, res) => h.getOneHandler(User, req, res, 'User'));
router.put('/:id', (req, res) => saveUser(req, res, req.params.id));

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!h.isValidId(id)) throw new h.ApiError(404, 'User not found');
    const user = await User.findById(id);
    if (!user) throw new h.ApiError(404, 'User not found');
    await Task.updateMany({ assignedUser: id }, { $set: { assignedUser: '', assignedUserName: 'unassigned' } });
    await User.deleteOne({ _id: user._id });
    res.status(204).end();
  } catch (err) { h.handleError(res, err); }
});

async function saveUser(req, res, id) {
  try {
    let existing = null;
    if (id !== null) {
      if (!h.isValidId(id)) throw new h.ApiError(404, 'User not found');
      existing = await User.findById(id);
      if (!existing) throw new h.ApiError(404, 'User not found');
    }

    const body = req.body || {};
    const name = h.requireString(body.name, 'name');
    const email = h.requireEmail(body.email);
    const newTasks = h.parseIdList(body.pendingTasks, 'pendingTasks');

    const dupFilter = existing ? { email, _id: { $ne: existing._id } } : { email };
    if (await User.findOne(dupFilter)) throw new h.ApiError(400, 'A user with this email already exists');

    const tasks = newTasks.length ? await Task.find({ _id: { $in: newTasks } }) : [];
    if (tasks.some(t => t.completed)) throw new h.ApiError(400, 'Completed tasks cannot be in pendingTasks');
    if (tasks.length !== newTasks.length) throw new h.ApiError(404, 'One or more tasks in pendingTasks do not exist');

    const user = existing || new User();
    const userId = user._id.toString();
    const oldTasks = existing ? existing.pendingTasks.slice() : [];

    user.name = name;
    user.email = email;
    user.pendingTasks = newTasks;
    await user.save();

    const removed = oldTasks.filter(t => !newTasks.includes(t) && h.isValidId(t));
    if (removed.length) {
      await Task.updateMany(
        { _id: { $in: removed }, assignedUser: userId },
        { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
      );
    }

    if (newTasks.length) {
      await User.updateMany({ _id: { $ne: user._id } }, { $pull: { pendingTasks: { $in: newTasks } } });
      await Task.updateMany({ _id: { $in: newTasks } }, { $set: { assignedUser: userId, assignedUserName: name } });
    }

    await Task.updateMany({ assignedUser: userId }, { $set: { assignedUserName: name } });

    res.status(existing ? 200 : 201).json({ message: existing ? 'User updated' : 'User created', data: user });
  } catch (err) { h.handleError(res, err); }
}

module.exports = router;