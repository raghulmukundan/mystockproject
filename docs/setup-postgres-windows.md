# PostgreSQL Windows Host Setup

## Option 1: Install PostgreSQL on Windows Host

### 1. Download and Install PostgreSQL
- Download from: https://www.postgresql.org/download/windows/
- Install PostgreSQL 15 or later
- Set password for `postgres` user
- Remember the port (default: 5432)

### 2. Create Database and User
Open PostgreSQL command line (psql) and run:

```sql
-- Create database
CREATE DATABASE stockwatchlist;

-- Create user
CREATE USER stockuser WITH PASSWORD 'your_secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE stockwatchlist TO stockuser;

-- Connect to the database
\c stockwatchlist

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO stockuser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO stockuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO stockuser;
```

### 3. Update Docker Compose
Use the host-based connection:

```yaml
services:
  backend:
    environment:
      - DATABASE_URL=postgresql://stockuser:your_secure_password@host.docker.internal:5432/stockwatchlist
```

### 4. Configure PostgreSQL for Docker Access
Edit `postgresql.conf`:
```
listen_addresses = '*'  # or 'localhost,172.17.0.1'
```

Edit `pg_hba.conf`, add:
```
host    stockwatchlist    stockuser    172.17.0.0/16    md5
host    stockwatchlist    stockuser    127.0.0.1/32     md5
```

### 5. Restart PostgreSQL Service
- Windows Services → PostgreSQL → Restart

## Option 2: Use Docker PostgreSQL Container

Use the provided `docker-compose.postgres.yml` file:

```bash
# Stop current containers
docker compose down

# Start with PostgreSQL
docker compose -f docker-compose.postgres.yml up -d

# Check logs
docker compose -f docker-compose.postgres.yml logs -f
```

## Benefits of PostgreSQL over SQLite

### ✅ **Concurrent Access**
- Multiple connections without locking issues
- Proper transaction isolation
- No WAL mode complications

### ✅ **Performance**
- Better indexing capabilities
- Query optimization
- Connection pooling
- Parallel processing

### ✅ **Reliability**
- ACID compliance
- Crash recovery
- Data integrity constraints
- Backup and restore tools

### ✅ **Scalability**
- Handles large datasets (multi-GB)
- Better memory management
- Streaming replication
- Partitioning support

### ✅ **Monitoring**
- Built-in query statistics
- Performance monitoring
- Connection tracking
- Lock monitoring

## Migration from SQLite

The system will automatically create PostgreSQL tables. To migrate existing data:

1. Export from SQLite:
```bash
sqlite3 data/stock_watchlist_clean.db .dump > backup.sql
```

2. Clean and import to PostgreSQL:
```bash
# Clean SQLite-specific syntax
sed 's/PRAGMA foreign_keys=OFF;//g' backup.sql > postgres_backup.sql

# Import to PostgreSQL
psql -U stockuser -d stockwatchlist -f postgres_backup.sql
```