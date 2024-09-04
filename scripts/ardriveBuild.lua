local json = require("json")

-- Load configuration from a separate file
local function load_config()
    local config_file = io.open("ardrive-config.json", "r")
    if not config_file then
        print("Error: ardrive-config.json not found. Please create this file with your ArDrive configuration.")
        os.exit(1)
    end
    local config_content = config_file:read("*all")
    config_file:close()
    return json:decode(config_content)
end

local config = load_config()

local function pretty_json(obj, indent)
    local indent = indent or ""
    local json_string = ""

    if type(obj) == "table" then
        json_string = json_string .. "{\n"
        local keys = {}
        for k in pairs(obj) do
            table.insert(keys, k)
        end
        table.sort(keys)
        for i, k in ipairs(keys) do
            local v = obj[k]
            json_string = json_string .. indent .. "  \"" .. k .. "\": "
            json_string = json_string .. pretty_json(v, indent .. "  ")
            if i < #keys then
                json_string = json_string .. ","
            end
            json_string = json_string .. "\n"
        end
        json_string = json_string .. indent .. "}"
    elseif type(obj) == "string" then
        json_string = json_string .. "\"" .. obj .. "\""
    else
        json_string = json_string .. tostring(obj)
    end

    return json_string
end

local function create_manifest(ardrive_output)
    local manifest = {
        manifest = "arweave/paths",
        version = "0.2.0",
        index = {
            path = "index.html"
        },
        paths = {}
    }

    if ardrive_output and ardrive_output.created then
        for _, item in ipairs(ardrive_output.created) do
            if item.type == "file" then
                local path = item.sourceUri:match("dist/(.+)")
                if path then
                    manifest.paths[path] = {
                        id = item.dataTxId
                    }

                    if path == "index.html" then
                        manifest.fallback = {
                            id = item.dataTxId
                        }
                    end
                end
            end
        end
    else
        print("Warning: No 'created' array found in ArDrive output")
    end

    return manifest
end

local function run_command(command)
    local handle = io.popen(command)
    local result = handle:read("*a")
    handle:close()
    return result
end

local function calculate_file_hash()
    local command = "find ./dist -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum"
    local handle = io.popen(command)
    local result = handle:read("*a")
    handle:close()
    return result:match("^%S+")
end

local function parse_version(version_string)
    local major, minor, patch = version_string:match("(%d+)%.(%d+)%.(%d+)")
    return {
        major = tonumber(major) or 0,
        minor = tonumber(minor) or 0,
        patch = tonumber(patch) or 0
    }
end

local function increment_version(is_prod_build)
    local version_file = "version.txt"
    local current_version = "0.0.0"
    local file = io.open(version_file, "r")
    if file then
        current_version = file:read("*l") or "0.0.0"
        file:close()
    end

    local version = parse_version(current_version)

    if is_prod_build then
        version.minor = version.minor + 1
        version.patch = 0
    else
        version.patch = version.patch + 1
    end

    local new_version = string.format("%d.%d.%d", version.major, version.minor, version.patch)

    file = io.open(version_file, "w")
    if file then
        file:write(new_version)
        file:close()
    end

    return new_version
end

local function get_timestamp()
    return os.date("%Y-%m-%d %H:%M:%S")
end

local function generate_build_id()
    return os.time() .. "-" .. string.format("%04x", math.random(0, 0xffff))
end

-- Parse command-line arguments
local is_prod_build = false
for i = 1, #arg do
    if arg[i] == "--prod" then
        is_prod_build = true
        break
    end
end

print("Running bun build...")
local build_success, build_result = run_command("bun run build")
if not build_success then
    print("Error: bun build failed. Output:")
    print(build_result)
    os.exit(1)
else
    print("bun build completed successfully")
end

-- Run ArDrive upload command for files
local upload_command = string.format([[
    ardrive upload-file --replace --local-path "./dist" --parent-folder-id "%s" -w %s
]], config.parentFolderId, config.walletPath)

local upload_result = run_command(upload_command)
print("Upload result:")
print(upload_result)

-- Check if upload_result is nil or empty
if not upload_result or upload_result == "" then
    print("Error: ArDrive command returned no output")
    os.exit(1)
end

-- Attempt to decode JSON using method format
local success, ardrive_output = pcall(function()
    return json:decode(upload_result)
end)

if success then
    print("JSON parsed successfully")
    print("ArDrive output structure:")
    for k, v in pairs(ardrive_output) do
        print(k, type(v))
    end

    local manifest = create_manifest(ardrive_output)
    print("Manifest created:")
    print(pretty_json(manifest))

    -- Save manifest as formatted JSON file
    local manifest_file = "manifest.json"
    local file = io.open(manifest_file, "w")
    if file then
        file:write(pretty_json(manifest))
        file:close()
        print("Manifest file created: " .. manifest_file)
    else
        print("Error: Unable to create manifest file")
        os.exit(1)
    end

    -- Generate a unique build ID
    local build_id = generate_build_id()

    -- Increment version
    local new_version = increment_version(is_prod_build)
    print("New version:", new_version)

    -- Upload manifest file with custom tags
    local manifest_upload_command = string.format([[
        ardrive upload-file --replace --content-type "application/x.arweave-manifest+json" --local-path "%s" --parent-folder-id "%s" -w %s --metadata-gql-tags "App-Name" "tiny4vr-builds" --metadata-gql-tags "App-Version" "%s" --metadata-gql-tags "Build-Type" "%s" --metadata-gql-tags "Build-ID" "%s"
    ]], manifest_file, config.parentFolderId, config.walletPath, new_version,
        is_prod_build and "production" or "development", build_id)

    local manifest_upload_result_raw = run_command(manifest_upload_command)
    print("Manifest upload result (raw):")
    print(manifest_upload_result_raw)

    -- Decode the manifest upload result
    local manifest_upload_success, manifest_upload_result = pcall(function()
        return json:decode(manifest_upload_result_raw)
    end)

    if manifest_upload_success then
        print("Manifest upload result decoded successfully")
        print("Manifest TxID:")
        if manifest_upload_result.created and manifest_upload_result.created[1] then
            print(manifest_upload_result.created[1].dataTxId)
            print("Website Link:")
            print("https://arweave.net/" .. manifest_upload_result.created[1].dataTxId)
        else
            print("Error: Unable to find dataTxId in the manifest upload result")
        end

        -- Calculate file hash
        local file_hash = calculate_file_hash()
        print("File hash:", file_hash)

        -- Create upload state
        local upload_state = {
            version = new_version,
            is_production_build = is_prod_build,
            build_id = build_id,
            file_hash = file_hash,
            build_timestamp = get_timestamp(),
            manifest = {
                tx_id = manifest_upload_result.created[1].dataTxId,
                size = manifest_upload_result.created[1].size,
                type = manifest_upload_result.created[1].type
            },
            files = {}
        }

        -- Add details for each uploaded file
        for _, item in ipairs(ardrive_output.created) do
            if item.type == "file" then
                local path = item.sourceUri:match("dist/(.+)")
                if path then
                    upload_state.files[path] = {
                        tx_id = item.dataTxId,
                        size = item.size,
                        type = item.type,
                        content_type = item.contentType
                    }
                end
            end
        end

        -- Save upload state
        local upload_state_file = "upload_state.json"
        local file = io.open(upload_state_file, "w")
        if file then
            file:write(pretty_json(upload_state))
            file:close()
            print("Upload state saved to:", upload_state_file)
        else
            print("Error: Unable to create upload state file")
        end

        -- Upload upload state file with custom tags
        local upload_state_upload_command = string.format([[
            ardrive upload-file --replace --local-path "%s" --parent-folder-id "%s" -w %s --metadata-gql-tags "App-Name" "tiny4vr-states" --metadata-gql-tags "App-Version" "%s" --metadata-gql-tags "Build-Type" "%s" --metadata-gql-tags "Build-ID" "%s"
        ]], upload_state_file, config.parentFolderId, config.walletPath, new_version,
            is_prod_build and "production" or "development", build_id)

        local upload_state_upload_result_raw = run_command(upload_state_upload_command)
        print("Upload state upload result (raw):")
        print(upload_state_upload_result_raw)

        -- Decode the upload state upload result
        local upload_state_upload_success, upload_state_upload_result = pcall(function()
            return json:decode(upload_state_upload_result_raw)
        end)

        if upload_state_upload_success then
            print("Upload state upload result decoded successfully")
            print("Upload state TxID:")
            if upload_state_upload_result.created and upload_state_upload_result.created[1] then
                print(upload_state_upload_result.created[1].dataTxId)
            else
                print("Error: Unable to find dataTxId in the upload state upload result")
            end
        else
            print("Error decoding upload state upload result. Error details:")
            print(upload_state_upload_result)
            print("Raw output:")
            print(upload_state_upload_result_raw)

            -- Attempt to extract error message
            local error_message = upload_state_upload_result_raw:match("Error: (.+)")
            if error_message then
                print("Extracted error message:", error_message)
            end
        end
    else
        print("Error decoding manifest upload result. Error details:")
        print(manifest_upload_result)
        print("Raw output:")
        print(manifest_upload_result_raw)
    end
else
    print("Error parsing JSON output from ArDrive. Error details:")
    print(ardrive_output)
    print("Raw output:")
    print(upload_result)

    -- Attempt to salvage partial JSON
    print("Attempting to parse as much JSON as possible...")
    local partial_success, partial_result = pcall(function()
        local cleaned_result = upload_result:match("({.*})")
        if cleaned_result then
            return json:decode(cleaned_result)
        else
            return nil
        end
    end)

    if partial_success and partial_result then
        print("Partial JSON parsed successfully:")
        for k, v in pairs(partial_result) do
            print(k, v)
        end
        ardrive_output = partial_result
    else
        print("Unable to salvage partial JSON")
        os.exit(1)
    end
end
