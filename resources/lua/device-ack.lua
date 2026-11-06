for uid, revision in pairs(cjson.decode(ARGV[1])) do
    if redis.call('HGET', KEYS[1], uid) == revision then redis.call('HDEL', KEYS[1], uid) end
end
return 1
