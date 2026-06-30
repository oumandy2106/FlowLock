import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:GIBBORAJEesp32@db.mbmaogbwlsvykhhtnpne.supabase.co:5432/postgres",
});

export default pool;
