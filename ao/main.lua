local json = require("json")

print("Script started")

-- Handler to create a new short URL
Handlers.add('CreateShortURL',
    Handlers.utils.hasMatchingTag('Action', 'CreateShortURL'),
    function(msg)
        print("CreateShortURL handler called")
        local longURL = msg.Tags["LongURL"]
        local shortCode = msg.Tags["ShortCode"]
        if not longURL or not shortCode then
            print("Error: Missing LongURL or ShortCode")
            ao.send({
                Target = msg.From,
                Action = "Response",
                Tags = { ["Action"] = "CreateShortURL" },
                Data = json.encode({ error = "Missing LongURL or ShortCode" })
            })
            return
        end

        -- Store the mapping in Arweave
        local tags = {
            { name = "Content-Type", value = "application/json" },
            { name = "App-Name",     value = "tiny4vr" },
            { name = "Short-Code",   value = shortCode },
            { name = "Long-URL",     value = longURL }
        }

        ao.send({
            Target = msg.From,
            Action = "Store",
            Tags = tags,
            Data = json.encode({ shortCode = shortCode, longURL = longURL })
        })

        print("Short URL created: " .. shortCode .. " for " .. longURL)
    end
)

print("Handlers loaded")
