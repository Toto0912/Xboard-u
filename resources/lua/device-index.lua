-- A concurrent importer must not overwrite a completed import or new report.
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
for uid, timestamp in pairs(cjson.decode(ARGV[2])) do redis.call('ZADD', KEYS[1], timestamp, uid) end
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
redis.call('SET', KEYS[2], 1)
return 1
