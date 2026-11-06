-- KEYS: node member index, pending SQL acknowledgements, revision sequence.
-- ARGV: fully prefixed user hash prefix, node ID, timestamp, TTL, mode, users.
local prefix, node = ARGV[1], ARGV[2] .. ':'
local now, ttl = tonumber(ARGV[3]), tonumber(ARGV[4])
local users = cjson.decode(ARGV[6])
local affected = {}
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - ttl - 1)
if ARGV[5] == 'full' then
    for _, uid in ipairs(redis.call('ZRANGE', KEYS[1], 0, -1)) do affected[uid] = true end
end
for uid, _ in pairs(users) do affected[uid] = true end
local revision = tostring(redis.call('INCR', KEYS[3]))
local ids = {}
for uid, _ in pairs(affected) do
    local key = prefix .. uid
    for _, field in ipairs(redis.call('HKEYS', key)) do
        if string.sub(field, 1, string.len(node)) == node then redis.call('HDEL', key, field) end
    end
    local ips = users[uid] or {}
    if #ips > 0 then
        for _, ip in ipairs(ips) do redis.call('HSET', key, node .. ip, now) end
        redis.call('EXPIRE', key, ttl)
        redis.call('ZADD', KEYS[1], now, uid)
    else
        redis.call('ZREM', KEYS[1], uid)
    end
    redis.call('HSET', KEYS[2], uid, revision)
    table.insert(ids, uid)
end
redis.call('EXPIRE', KEYS[1], ttl)
redis.call('EXPIRE', KEYS[2], ttl * 3)
local pending = {}
local fields = redis.call('HGETALL', KEYS[2])
for i = 1, #fields, 2 do pending[fields[i]] = fields[i + 1] end
return cjson.encode({users = ids, pending = pending})
