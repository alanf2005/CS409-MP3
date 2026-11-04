const express = require('express');
const User = require('../models/user');
const Task = require('../models/task');
const h = require('./helpers');

const router = express.Router();

router.get('/', (req, res) => h.listHandler(Task, req, res, 100));
router.post('/', (req, res) => saveTask(req, res, null));
router.get('/:id', (req, res) => h.getOneHandler(Task, req, res, 'Task'));
router.put('/:id', (req, res) => saveTask(req, res, req.params.id));

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!h.isValidId(id)) throw new h.ApiError(404, 'Task not found');
    const task = await Task.findById(id);
    if (!task) throw new h.ApiError(404, 'Task not found');
    await User.updateMany({ pendingTasks: id }, { $pull: { pendingTasks: id } });
    await Task.deleteOne({ _id: task._id });
    res.status(200).json({ message: 'Task deleted', data: task });
  } catch (err) { h.handleError(res, err); }
});

async function saveTask(req, res, id) {
  try {
    let existing = null;
    if (id !== null) {
      if (!h.isValidId(id)) throw new h.ApiError(404, 'Task not found');
      existing = await Task.findById(id);
      if (!existing) throw new h.ApiError(404, 'Task not found');
    }

    const body = req.body || {};
    const name = h.requireString(body.name, 'name');
    const deadline = h.parseDeadline(body.deadline);
    const description = h.optionalString(body.description, 'description', '');
    const completed = h.parseBool(body.completed, 'completed', false);
    const assignedUser = h.optionalString(body.assignedUser, 'assignedUser', '').trim();
    const nameGiven = body.assignedUserName !== undefined && body.assignedUserName !== null && body.assignedUserName !== '';
    let assignedUserName = h.optionalString(body.assignedUserName, 'assignedUserName', '');

    if (assignedUser === '') {
      if (nameGiven && assignedUserName !== 'unassigned') {
        throw new h.ApiError(400, 'assignedUserName must be "unassigned" when the task has no assignedUser');
      }
      assignedUserName = 'unassigned';
    } else {
      if (!h.isValidId(assignedUser)) throw new h.ApiError(400, 'assignedUser is not a valid user id');
      const user = await User.findById(assignedUser);
      if (!user) throw new h.ApiError(404, 'Assigned user not found');
      if (nameGiven && assignedUserName !== user.name) {
        throw new h.ApiError(400, 'assignedUserName does not match the name of the assigned user');
      }
      assignedUserName = user.name;
    }

    const task = existing || new Task();
    const taskId = task._id.toString();
    task.name = name;
    task.description = description;
    task.deadline = deadline;
    task.completed = completed;
    task.assignedUser = assignedUser;
    task.assignedUserName = assignedUserName;
    await task.save();

    const pullFilter = assignedUser ? { _id: { $ne: assignedUser }, pendingTasks: taskId } : { pendingTasks: taskId };
    await User.updateMany(pullFilter, { $pull: { pendingTasks: taskId } });

    if (assignedUser) {
      if (completed) await User.updateOne({ _id: assignedUser }, { $pull: { pendingTasks: taskId } });
      else await User.updateOne({ _id: assignedUser }, { $addToSet: { pendingTasks: taskId } });
    }

    res.status(existing ? 200 : 201).json({ message: existing ? 'Task updated' : 'Task created', data: task });
  } catch (err) { h.handleError(res, err); }
}

module.exports = router;