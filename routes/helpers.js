class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const isValidId = id => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);

function handleError(res, err) {
  if (err instanceof ApiError) return res.status(err.status).json({ message: err.message, data: {} });
  if (err && err.code === 11000) return res.status(400).json({ message: 'A user with this email already exists', data: {} });
  if (err && (err.name === 'ValidationError' || err.name === 'CastError')) {
    return res.status(400).json({ message: 'Invalid request data', data: {} });
  }
  console.error(err);
  return res.status(500).json({ message: 'Something went wrong on the server', data: {} });
}

function isQueryError(err) {
  if (!err) return false;
  if (err.name === 'CastError' || err.name === 'StrictModeError') return true;
  return err.name === 'MongoServerError' && [2, 9, 31253, 31254].includes(err.code);
}

// ---------- query-string parsing ----------
function parseJSONObject(value, name) {
  if (value === undefined) return undefined;
  let parsed;
  try { parsed = JSON.parse(value); } catch (e) {
    throw new ApiError(400, `Query parameter '${name}' must be valid JSON`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError(400, `Query parameter '${name}' must be a JSON object`);
  }
  return parsed;
}

function parseNonNegInt(value, name) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (typeof value !== 'string' || value.trim() === '' || !Number.isInteger(n) || n < 0) {
    throw new ApiError(400, `Query parameter '${name}' must be a non-negative integer`);
  }
  return n;
}

function parseCount(value) {
  if (value === undefined) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ApiError(400, "Query parameter 'count' must be true or false");
}

async function listHandler(Model, req, res, defaultLimit) {
  try {
    const where = parseJSONObject(req.query.where, 'where') || {};
    const sort = parseJSONObject(req.query.sort, 'sort');
    const select = parseJSONObject(req.query.select, 'select');
    const skip = parseNonNegInt(req.query.skip, 'skip');
    let limit = parseNonNegInt(req.query.limit, 'limit');
    const count = parseCount(req.query.count);

    let result;
    try {
      if (count) {
        let q = Model.countDocuments(where);
        if (skip !== undefined) q = q.skip(skip);
        if (limit !== undefined) q = q.limit(limit);
        result = await q.exec();
      } else {
        let q = Model.find(where);
        if (sort) q = q.sort(sort);
        if (select) q = q.select(select);
        if (skip !== undefined) q = q.skip(skip);
        if (limit === undefined) limit = defaultLimit;
        if (limit !== undefined) q = q.limit(limit);
        result = await q.exec();
      }
    } catch (err) {
      if (isQueryError(err)) throw new ApiError(400, 'Invalid query parameters');
      throw err;
    }
    res.status(200).json({ message: 'OK', data: result });
  } catch (err) { handleError(res, err); }
}

async function getOneHandler(Model, req, res, label) {
  try {
    if (!isValidId(req.params.id)) throw new ApiError(404, `${label} not found`);
    const select = parseJSONObject(req.query.select, 'select');
    let q = Model.findById(req.params.id);
    if (select) q = q.select(select);
    let doc;
    try { doc = await q.exec(); } catch (err) {
      if (isQueryError(err)) throw new ApiError(400, "Invalid 'select' parameter");
      throw err;
    }
    if (!doc) throw new ApiError(404, `${label} not found`);
    res.status(200).json({ message: 'OK', data: doc });
  } catch (err) { handleError(res, err); }
}

// ---------- body validation ----------
function requireString(v, field) {
  if (typeof v !== 'string' || v.trim() === '') throw new ApiError(400, `A ${field} is required`);
  return v.trim();
}

function requireEmail(v) {
  const email = requireString(v, 'email');
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new ApiError(400, 'Email is not valid');
  return email;
}

function optionalString(v, field, def) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'string') throw new ApiError(400, `${field} must be a string`);
  return v;
}

function parseDeadline(v) {
  if (v === undefined || v === null || v === '') throw new ApiError(400, 'A deadline is required');
  let d;
  if (typeof v === 'number') d = new Date(v);
  else if (typeof v === 'string') d = /^-?\d+$/.test(v.trim()) ? new Date(Number(v)) : new Date(v);
  else throw new ApiError(400, 'deadline must be a valid date');
  if (isNaN(d.getTime())) throw new ApiError(400, 'deadline must be a valid date');
  return d;
}

function parseBool(v, field, def) {
  if (v === undefined || v === null) return def;
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  throw new ApiError(400, `${field} must be true or false`);
}

function parseIdList(v, field) {
  if (v === undefined || v === null || v === '') return [];
  let list;
  if (typeof v === 'string') list = [v];
  else if (Array.isArray(v)) list = v;
  else throw new ApiError(400, `${field} must be a list of ids`);
  for (const id of list) {
    if (!isValidId(id)) throw new ApiError(400, `${field} contains an invalid id`);
  }
  return [...new Set(list)];
}

module.exports = {
  ApiError, isValidId, handleError, listHandler, getOneHandler,
  requireString, requireEmail, optionalString, parseDeadline, parseBool, parseIdList
};