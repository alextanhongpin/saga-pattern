const SELECT = `
  SELECT * 
  FROM event 
  ORDER BY id 
  LIMIT $1
  FOR UPDATE 
  SKIP LOCKED
`;

const DELETE = `
  DELETE FROM event 
  WHERE id <= $1
`;

export default async function poolEvent(
  db,
  asyncFn,
  limit = 10,
  duration = 5000
) {
  let timeout;
  try {
    await db.query("BEGIN");
    const result = await db.query(SELECT, [limit]);

    timeout = setTimeout(() => {
      throw new Error("poolEventError: timeout");
    }, duration);

    const events = result.rows;
    let lastId = -1;
    for await (let event of events) {
      try {
        await asyncFn(event);
        lastId = event.id;
      } catch (error) {
        console.error(error);
        break;
      }
    }

    if (lastId > 0) {
      await db.query(DELETE, [lastId]);
    }

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACk");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
