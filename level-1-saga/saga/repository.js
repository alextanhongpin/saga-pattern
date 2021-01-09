const CREATE = `
  INSERT INTO saga_state (correlation_id, name) 
  VALUES ($1, $2)
  ON CONFLICT (correlation_id) DO UPDATE SET updated_at = current_timestamp
  RETURNING *
`;

const UPDATE = `
  UPDATE saga_state 
  SET history = array_append(history, $1)
  WHERE correlation_id = $2
  RETURNING *
`;

const SOFT_DELETE = `
  UPDATE saga_state 
  SET deleted_at = current_timestamp 
  WHERE id = $1
  RETURNING *
`;

const FIND_ONE_BY_CORRELATION_ID = `
  SELECT * 
  FROM saga_state 
  WHERE correlation_id = $1
`;

export default class SagaRepository {
  constructor(db) {
    this.db = db;
  }

  async create({ correlationId, name }) {
    const values = [correlationId, name];
    const result = await this.db.query(CREATE, values);
    return result.rows[0];
  }

  async update({ correlationId, data }) {
    const values = [data, correlationId];
    const result = await this.db.query(UPDATE, values);
    return result.rows[0];
  }

  async delete({ id }) {
    const values = [id];
    const result = await this.db.query(SOFT_DELETE, values);
    return result.rows[0];
  }

  async findOneByCorrelationId(correlationId) {
    const values = [correlationId];
    const result = await this.db.query(FIND_ONE_BY_CORRELATION_ID, values);
    return result.rows[0];
  }
}
