const express = require('express');
const db = require('./database');
const { authRequired, authOptional } = require('./middleware');

const router = express.Router();

router.post('/', authRequired, (req, res) => {
  try {
    const { slotName, simName, bodyCount, simTime, data, isPublic } = req.body;
    if (!slotName || !data) return res.status(400).json({ error: 'slotName and data are required' });

    const existing = db.findSimByUserAndSlot(req.user.id, slotName);
    if (existing) {
      db.updateSimulation(existing.id, {
        sim_name: simName || slotName, body_count: bodyCount || 0,
        sim_time: simTime || 0, data,
        is_public: isPublic !== undefined ? (isPublic ? 1 : 0) : 1,
      });
      res.json({ id: existing.id, message: 'Simulation updated' });
    } else {
      const sim = db.createSimulation({
        userId: req.user.id, slotName, simName, bodyCount, simTime, data,
        isPublic: isPublic !== undefined ? isPublic : true,
      });
      res.status(201).json({ id: sim.id, message: 'Simulation saved' });
    }
  } catch (err) { console.error('Save simulation error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/mine', authRequired, (req, res) => {
  const sims = db.listSimsByUser(req.user.id).map(s => ({
    id: s.id, slot_name: s.slot_name, sim_name: s.sim_name,
    body_count: s.body_count, sim_time: s.sim_time,
    is_public: s.is_public, created_at: s.created_at, updated_at: s.updated_at,
  }));
  res.json(sims);
});

router.get('/:id', authOptional, (req, res) => {
  const sim = db.findSimById(parseInt(req.params.id));
  if (!sim) return res.status(404).json({ error: 'Simulation not found' });
  const isOwner = req.user?.id === sim.user_id;
  if (!sim.is_public && !isOwner) return res.status(403).json({ error: 'This simulation is private' });
  const user = db.findUserById(sim.user_id);
  res.json({ ...sim, username: user?.username || 'Unknown' });
});

router.delete('/:id', authRequired, (req, res) => {
  const sim = db.findSimById(parseInt(req.params.id));
  if (!sim) return res.status(404).json({ error: 'Simulation not found' });
  if (sim.user_id !== req.user.id) return res.status(403).json({ error: 'Not your simulation' });
  db.deleteSimulation(sim.id);
  res.json({ message: 'Simulation deleted' });
});

router.get('/', authOptional, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const search = req.query.search || '';
  res.json(db.listPublicSims({ search, page, limit }));
});

module.exports = router;
