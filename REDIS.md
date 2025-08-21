# Redis Setup

## Quick Start

### Using Docker (Recommended)
1. Install Docker Desktop
2. Start Redis:
   ```bash
   docker-compose up -d redis
   ```
3. The game server will automatically connect to Redis at `localhost:6379`

### Optional: Redis GUI
Start Redis Commander for a web-based GUI:
```bash
docker-compose up -d redis-commander
```
Then visit http://localhost:8081 to view your Redis data.

### Without Docker
1. Install Redis locally:
   - Mac: `brew install redis`
   - Ubuntu: `sudo apt-get install redis-server`
   - Windows: Use WSL or Docker
2. Start Redis: `redis-server`

## Features with Redis

When Redis is available, the game server will:
- ✅ Persist user accounts across server restarts
- ✅ Maintain sessions for 24 hours
- ✅ Save ship customizations permanently
- ✅ Track online/offline status
- ✅ Store game statistics (playtime, materials collected, etc.)
- ✅ Support leaderboards
- ✅ Enable friend systems (future feature)

## Fallback Mode

If Redis is not available, the server will:
- Still work normally but with in-memory storage
- Lose all data when the server restarts
- Log a warning message on startup

## Environment Variables

- `REDIS_URL`: Custom Redis connection URL (default: `redis://localhost:6379`)
- Example: `REDIS_URL=redis://user:password@host:port`

## Monitoring

Check Redis connection status in server logs:
- ✅ "Server: Using Redis for data persistence" - Redis connected
- ⚠️ "Server: Redis not available, falling back to in-memory storage" - Running without Redis

## Data Structure

### Users
- Key: `user:{userId}`
- Fields: userId, username, createdAt, customization, stats

### Sessions  
- Key: `session:{token}`
- TTL: 24 hours
- Data: userId, username, createdAt

### Online Status
- Key: `online:{userId}`
- TTL: 5 minutes (requires heartbeat)

### Username Lookup
- Key: `username:{username}`
- Value: userId

## Troubleshooting

### Redis won't connect
1. Check if Redis is running: `docker ps` or `redis-cli ping`
2. Check firewall/port 6379 is open
3. Check server logs for connection errors

### Data not persisting
1. Check Redis is actually connected (see logs)
2. Ensure Redis has enough memory
3. Check Redis persistence settings

### Performance issues
1. Monitor Redis memory usage: `redis-cli INFO memory`
2. Check slow queries: `redis-cli SLOWLOG GET`
3. Consider increasing Redis memory limit in docker-compose.yml