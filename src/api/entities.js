// Data layer shared by the browser and the API functions.
//
// Each table is exposed as `entities.<Name>` with filter / list / get / create / update / delete /
// count, and filters use the small Mongo-style vocabulary the app already speaks
// ({ status: 'active', price: { $lte: 100 }, $or: [...] }). Filters are translated into a single
// PostgREST logic tree, so every value is quoted and every field is checked against the schema.
// Row-level security in Postgres decides what each caller may see or change.

import { ENTITIES, META_COLUMNS } from './schema.js';

export class DataError extends Error {
  constructor(message, status = 400, data) {
    super(message);
    this.name = 'DataError';
    this.status = status;
    this.response = { status, data: data ?? { error: message } };
  }
}

const MAX_ROWS = 1000;
const META_KIND = { id: 'text', created_date: 'text', updated_date: 'text', created_by: 'text', created_by_id: 'text' };

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

// PostgREST logic-tree value quoting: wrap in double quotes, escape backslash and quote.
const quote = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const scalar = (v) => {
  if (v instanceof Date) return quote(v.toISOString());
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new DataError('Filter value must be a finite number.');
    return String(v);
  }
  if (typeof v === 'boolean') return String(v);
  if (v === null || v === undefined) throw new DataError('Use $exists to filter on missing values.');
  if (typeof v === 'object') throw new DataError('Unsupported filter value.');
  return quote(v);
};

function kindOf(info, field) {
  if (field in META_KIND) return META_KIND[field];
  const kind = info.columns[field];
  if (!kind) throw new DataError(`Unknown field "${field}" on ${info.name}.`);
  return kind;
}

function eqCond(field, kind, value) {
  if (value === null) return `${field}.is.null`;
  if (kind === 'array') {
    if (Array.isArray(value)) return `${field}.eq.${quote(JSON.stringify(value))}`;
    return `${field}.cs.${quote(JSON.stringify([value]))}`;
  }
  if (kind === 'json') return `${field}.eq.${quote(JSON.stringify(value))}`;
  return `${field}.eq.${scalar(value)}`;
}

function inCond(field, kind, values, negate) {
  if (!Array.isArray(values)) throw new DataError('$in / $nin need a list.');
  if (kind === 'array') {
    if (!values.length) return negate ? 'id.not.is.null' : 'id.is.null';
    const parts = values.map((v) => `${field}.${negate ? 'not.cs' : 'cs'}.${quote(JSON.stringify([v]))}`);
    if (negate) return `or(${field}.is.null,and(${parts.join(',')}))`;
    return parts.length === 1 ? parts[0] : `or(${parts.join(',')})`;
  }
  if (!values.length) return negate ? 'id.not.is.null' : 'id.is.null';
  const list = `(${values.map(scalar).join(',')})`;
  return negate ? `or(${field}.not.in.${list},${field}.is.null)` : `${field}.in.${list}`;
}

function fieldCond(info, field, spec) {
  const kind = kindOf(info, field);
  if (!isPlainObject(spec) || !Object.keys(spec).some((k) => k.startsWith('$'))) return eqCond(field, kind, spec);

  const parts = [];
  for (const [op, value] of Object.entries(spec)) {
    switch (op) {
      case '$eq':
        parts.push(eqCond(field, kind, value));
        break;
      case '$ne':
        if (value === null) parts.push(`${field}.not.is.null`);
        else if (kind === 'array') parts.push(`or(${field}.is.null,${field}.not.cs.${quote(JSON.stringify([value]))})`);
        else parts.push(`or(${field}.neq.${scalar(value)},${field}.is.null)`);
        break;
      case '$gt':
      case '$gte':
      case '$lt':
      case '$lte':
        parts.push(`${field}.${op.slice(1)}.${scalar(value)}`);
        break;
      case '$in':
        parts.push(inCond(field, kind, value, false));
        break;
      case '$nin':
        parts.push(inCond(field, kind, value, true));
        break;
      case '$exists':
        parts.push(value ? `${field}.not.is.null` : `${field}.is.null`);
        break;
      case '$regex': {
        const source = value instanceof RegExp ? value.source : String(value);
        const insensitive = value instanceof RegExp ? value.flags.includes('i') : String(spec.$options || '').includes('i');
        parts.push(`${field}.${insensitive ? 'imatch' : 'match'}.${quote(source)}`);
        break;
      }
      case '$options':
        break;
      default:
        throw new DataError(`Unsupported filter operator ${op}.`);
    }
  }
  if (!parts.length) throw new DataError(`Empty filter on ${field}.`);
  return parts.length === 1 ? parts[0] : `and(${parts.join(',')})`;
}

/** Translate a Mongo-style query into a list of PostgREST logic-tree conditions (AND-ed). */
export function conditions(info, query = {}) {
  if (!isPlainObject(query)) throw new DataError('Filter must be an object.');
  const out = [];
  for (const [key, spec] of Object.entries(query)) {
    if (spec === undefined) continue;
    if (key === '$or' || key === '$and') {
      if (!Array.isArray(spec) || !spec.length) throw new DataError(`${key} needs a non-empty list.`);
      const groups = spec.map((q) => {
        const c = conditions(info, q);
        if (!c.length) return null;
        return c.length === 1 ? c[0] : `and(${c.join(',')})`;
      });
      if (key === '$or') {
        if (groups.some((g) => g === null)) continue; // an empty branch matches everything
        out.push(groups.length === 1 ? groups[0] : `or(${groups.join(',')})`);
      } else {
        out.push(...groups.filter(Boolean));
      }
      continue;
    }
    if (key.startsWith('$')) throw new DataError(`Unsupported filter operator ${key}.`);
    out.push(fieldCond(info, key, spec));
  }
  return out;
}

function applyFilter(builder, info, query) {
  const conds = conditions(info, query);
  if (!conds.length) return builder;
  return builder.or(conds.length === 1 ? conds[0] : `and(${conds.join(',')})`);
}

function parseSort(info, sort) {
  if (!sort) return [];
  const list = Array.isArray(sort) ? sort : String(sort).split(',');
  return list
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const desc = s.startsWith('-');
      const field = desc ? s.slice(1) : s.replace(/^\+/, '');
      kindOf(info, field);
      return { field, desc };
    });
}

function selectList(info, fields) {
  if (!fields?.length) return '*';
  const set = new Set(['id', ...fields]);
  set.forEach((f) => kindOf(info, f));
  return [...set].join(',');
}

/** Keep only real, writable columns; drop undefined. Meta columns are set by the database. */
function cleanRow(info, data) {
  if (!isPlainObject(data)) throw new DataError('Data must be an object.');
  const row = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || META_COLUMNS.includes(k)) continue;
    if (!(k in info.columns)) continue;
    row[k] = v instanceof Date ? v.toISOString() : v;
  }
  return row;
}

function toDataError(error, fallbackStatus = 400) {
  if (!error) return null;
  if (error instanceof DataError) return error;
  const code = error.code || '';
  const message = error.message || 'Database request failed.';
  if (code === '42501' || /row-level security/i.test(message)) {
    return new DataError(/You can't|Only .* can be changed|That offer/.test(message) ? message : "You don't have permission to do that.", 403);
  }
  if (code === 'PGRST116') return new DataError('Not found.', 404);
  if (code === '23505') return new DataError('That already exists.', 409);
  if (code === '23514' || code === '23502' || code === '22P02' || code === '23503') return new DataError(message, 400);
  if (code === 'PGRST301' || code === 'PGRST302') return new DataError('Please sign in again.', 401);
  return new DataError(message, Number(error.status) || fallbackStatus);
}

const withPage = (rows, hasMore, nextOffset) => {
  Object.defineProperty(rows, 'has_more', { value: hasMore, enumerable: false });
  Object.defineProperty(rows, 'next_cursor', { value: hasMore ? String(nextOffset) : null, enumerable: false });
  return rows;
};

class EntityStore {
  constructor(client, name, info, options) {
    this.client = client;
    this.name = name;
    this.info = { ...info, name };
    this.table = info.table;
    this.options = options;
  }

  // Secret-scan findings live in their own table so only the owner (or the server) can read them.
  async decorate(rows) {
    if (this.name !== 'ProjectScan' || !rows.length) return rows;
    const ids = rows.map((r) => r.id).filter(Boolean);
    if (!ids.length) return rows;
    const { data, error } = await this.client.from('project_scan_private').select('scan_id,private_findings').in('scan_id', ids);
    if (error && !/permission denied/i.test(error.message || '')) throw toDataError(error);
    const byId = new Map((data || []).map((r) => [r.scan_id, r.private_findings]));
    rows.forEach((r) => {
      r.private_findings = byId.has(r.id) ? byId.get(r.id) : null;
    });
    return rows;
  }

  splitPrivate(data) {
    if (this.name !== 'ProjectScan' || !isPlainObject(data) || !('private_findings' in data)) return [data, undefined];
    const { private_findings: privateFindings, ...rest } = data;
    return [rest, privateFindings];
  }

  async savePrivate(row, privateFindings) {
    if (privateFindings === undefined || !row?.id) return row;
    const { error } = await this.client
      .from('project_scan_private')
      .upsert({ scan_id: row.id, owner_id: row.owner_id, private_findings: privateFindings });
    if (error) throw toDataError(error);
    row.private_findings = privateFindings;
    return row;
  }

  async filter(query = {}, sortOrOptions, limit, skip, fields) {
    let opts = { sort: sortOrOptions, limit, skip, fields };
    if (isPlainObject(sortOrOptions)) opts = { ...sortOrOptions };
    const lim = Math.max(1, Math.min(Number(opts.limit) || MAX_ROWS, MAX_ROWS));
    const offset = Math.max(0, Number(opts.cursor ?? opts.skip) || 0);

    let q = this.client.from(this.table).select(selectList(this.info, opts.fields));
    q = applyFilter(q, this.info, query);
    const order = parseSort(this.info, opts.sort);
    order.forEach(({ field, desc }) => {
      q = q.order(field, { ascending: !desc, nullsFirst: !desc });
    });
    if (!order.some((o) => o.field === 'id')) q = q.order('id', { ascending: true });
    q = q.range(offset, offset + lim); // one extra row tells us whether there's another page

    const { data, error } = await q;
    if (error) throw toDataError(error);
    const rows = data || [];
    const hasMore = rows.length > lim;
    const page = hasMore ? rows.slice(0, lim) : rows;
    await this.decorate(page);
    return withPage(page, hasMore, offset + lim);
  }

  list(sortOrOptions, limit, skip, fields) {
    return this.filter({}, sortOrOptions, limit, skip, fields);
  }

  async get(id) {
    if (id === undefined || id === null || id === '') throw new DataError('Not found.', 404);
    const { data, error } = await this.client.from(this.table).select('*').eq('id', String(id)).maybeSingle();
    if (error) throw toDataError(error);
    if (!data) throw new DataError(`${this.name} not found.`, 404);
    await this.decorate([data]);
    return data;
  }

  async create(data) {
    const [publicPart, privateFindings] = this.splitPrivate(data);
    const row = cleanRow(this.info, publicPart);
    const { data: created, error } = await this.client.from(this.table).insert(row).select('*').single();
    if (error) throw toDataError(error);
    return this.savePrivate(created, privateFindings);
  }

  async bulkCreate(list) {
    if (!Array.isArray(list)) throw new DataError('bulkCreate needs a list.');
    const out = [];
    for (const item of list) out.push(await this.create(item));
    return out;
  }

  async update(id, data) {
    const [publicPart, privateFindings] = this.splitPrivate(data);
    const row = cleanRow(this.info, publicPart?.$set && isPlainObject(publicPart.$set) ? publicPart.$set : publicPart);
    let updated;
    if (Object.keys(row).length) {
      const { data: rows, error } = await this.client.from(this.table).update(row).eq('id', String(id)).select('*');
      if (error) throw toDataError(error);
      updated = rows?.[0];
    } else {
      const { data: found, error } = await this.client.from(this.table).select('*').eq('id', String(id)).maybeSingle();
      if (error) throw toDataError(error);
      updated = found;
    }
    if (!updated) throw new DataError(`${this.name} not found, or you can't change it.`, 404);
    return this.savePrivate(updated, privateFindings);
  }

  // Bulk changes: find the matching ids with a normal read, then change exactly those rows.
  // (PostgREST re-applies logic-tree filters to the rows a mutation returns, so filtering the
  // mutation itself would hide rows whose filtered columns just changed.)
  async matchingIds(query) {
    if (!conditions(this.info, query).length) throw new DataError('Bulk changes need a filter.');
    let q = this.client.from(this.table).select('id');
    q = applyFilter(q, this.info, query).limit(MAX_ROWS);
    const { data, error } = await q;
    if (error) throw toDataError(error);
    return (data || []).map((r) => r.id);
  }

  async updateMany(query, data) {
    const row = cleanRow(this.info, data?.$set && isPlainObject(data.$set) ? data.$set : data);
    if (!Object.keys(row).length) return { updated: 0 };
    const ids = await this.matchingIds(query);
    let updated = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const { data: rows, error } = await this.client.from(this.table).update(row).in('id', ids.slice(i, i + 100)).select('id');
      if (error) throw toDataError(error);
      updated += rows?.length || 0;
    }
    return { updated };
  }

  async delete(id) {
    const { data, error } = await this.client.from(this.table).delete().eq('id', String(id)).select('id');
    if (error) throw toDataError(error);
    if (!data?.length) throw new DataError(`${this.name} not found, or you can't delete it.`, 404);
    return { id: String(id), deleted: true };
  }

  async deleteMany(query) {
    const ids = await this.matchingIds(query);
    let deleted = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await this.client.from(this.table).delete().in('id', ids.slice(i, i + 100)).select('id');
      if (error) throw toDataError(error);
      deleted += data?.length || 0;
    }
    return { deleted };
  }

  async count(query = {}) {
    let q = this.client.from(this.table).select('id', { count: 'exact', head: true });
    q = applyFilter(q, this.info, query);
    const { count, error } = await q;
    if (error) throw toDataError(error);
    return count || 0;
  }

  subscribe(callback) {
    if (!this.options.realtime) throw new DataError('Live updates are only available in the browser.');
    return this.options.realtime(this.table, callback);
  }
}

/**
 * entities.<Name> for every table in the schema.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ realtime?: (table: string, callback: Function) => Function }} [options]
 */
export function createEntities(client, options = {}) {
  const out = {};
  for (const [name, info] of Object.entries(ENTITIES)) {
    out[name] = new EntityStore(client, name, info, options);
  }
  return out;
}

export { toDataError };
