local json = require("json")

print("Script started")

URLs = {}

-- Function to generate a random short code
local function generateShortCode(length)
    print("Generating short code of length: " .. length)
    local chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    local code = ""
    for i = 1, length do
        local rand = math.random(#chars)
        code = code .. string.sub(chars, rand, rand)
    end
    print("Generated short code: " .. code)
    return code
end

-- Handler to create a new short URL
Handlers.add('CreateShortURL',
    Handlers.utils.hasMatchingTag('Action', 'CreateShortURL'),
    function(msg)
        print("CreateShortURL handler called")
        local longURL = msg.Tags["LongURL"]
        if not longURL then
            print("Error: Missing LongURL")
            ao.send({
                Target = msg.From,
                Action = "Response",
                Tags = { ["Action"] = "CreateShortURL" },
                Data = json.encode({ error = "Missing LongURL" })
            })
            return
        end

        local shortCode = generateShortCode(6)

        -- Store the mapping in Arweave
        local tags = {
            { name = "Content-Type", value = "application/json" },
            { name = "App-Name",     value = "4vrtiny" },
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

print("Handler registered")
