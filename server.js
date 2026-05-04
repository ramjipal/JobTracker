const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ─── Mongoose Schema ────────────────────────────────────────────────────────
const jobSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  company:   { type: String, default: '' },
  link:      { type: String, required: true },
  addedBy:   { type: String, required: true },
  dateAdded: { type: String, required: true },
  appliedBy: { type: [String], default: [] }
});

const Job = mongoose.model('Job', jobSchema);

// ─── Connect to MongoDB ────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => { console.error('❌ MongoDB connection error:', err); process.exit(1); });

// ─── GET all jobs ──────────────────────────────────────────────────────────
app.get('/jobs', async (req, res) => {
  try {
    const jobs = await Job.find().sort({ dateAdded: -1 }).lean();
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch jobs.' });
  }
});

// ─── POST add new job ──────────────────────────────────────────────────────
app.post('/jobs', async (req, res) => {
  const { company, link, addedBy } = req.body;

  if (!link || !addedBy) {
    return res.status(400).json({ error: 'Job link and name are required.' });
  }

  try {
    const escaped = link.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const duplicate = await Job.findOne({
      link: { $regex: new RegExp('^' + escaped + '$', 'i') }
    });
    if (duplicate) {
      return res.status(409).json({ error: 'A job with this link already exists.' });
    }

    const newJob = new Job({
      id:        Date.now().toString(),
      company:   company ? company.trim() : '',
      link:      link.trim(),
      addedBy:   addedBy.trim(),
      dateAdded: new Date().toISOString(),
      appliedBy: []
    });

    await newJob.save();
    res.status(201).json(newJob.toObject());
  } catch (err) {
    res.status(500).json({ error: 'Failed to add job.' });
  }
});

// ─── PATCH toggle application status ──────────────────────────────────────
app.patch('/jobs/:id', async (req, res) => {
  const { id } = req.params;
  const { user } = req.body;

  if (!user) {
    return res.status(400).json({ error: 'User name is required.' });
  }

  try {
    const job = await Job.findOne({ id });
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const idx = job.appliedBy.indexOf(user.trim());
    if (idx === -1) {
      job.appliedBy.push(user.trim());
    } else {
      job.appliedBy.splice(idx, 1);
    }

    await job.save();
    res.json(job.toObject());
  } catch (err) {
    res.status(500).json({ error: 'Failed to update job.' });
  }
});

// ─── DELETE jobs older than 60 days ───────────────────────────────────────
app.delete('/jobs/cleanup', async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const result = await Job.deleteMany({ dateAdded: { $lt: cutoff } });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clean up old jobs.' });
  }
});

// ─── DELETE a job ──────────────────────────────────────────────────────────
app.delete('/jobs/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await Job.deleteOne({ id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Job not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete job.' });
  }
});

// ─── Serve Frontend ────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Job Tracker running at http://localhost:${PORT}`);
});
