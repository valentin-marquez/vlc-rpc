local presence_active = false
local status_file_path = nil
local debug_mode = true -- Change to false to disable debug messages

function debug_log(message)
    if debug_mode then
        vlc.msg.info("Discord RP Debug: " .. tostring(message))
    end
end

local discord_ext_info = {
    title = "Discord Rich Presence",
    version = "1.1.0",
    author = "Valentin Marquez",
    url = 'https://github.com/valentin-marquez/vlc-discord-rp',
    shortdesc = "Discord RP",
    description = "Display your currently playing media in Discord Rich Presence",
    capabilities = {"menu", "input-listener", "meta-listener", "playing-listener", "playlist-listener"}
}

function descriptor()
    return discord_ext_info
end

function setup_status_file()
    debug_log("Setting up status file")

    local cache_dir = ""
    local ok, dir = pcall(function()
        return vlc.config.cachedir()
    end)

    if ok and dir then
        cache_dir = dir
    else
        ok, dir = pcall(function()
            return vlc.config.userdatadir()
        end)
        if ok and dir then
            cache_dir = dir
        else
            if string.match(package.config, "\\") then
                cache_dir = os.getenv("TEMP") or "C:\\Temp"
            else
                cache_dir = "/tmp"
            end
        end
    end

    if not string.match(cache_dir, "[/\\]$") then
        cache_dir = cache_dir .. "/"
    end

    cache_dir = string.gsub(cache_dir, "\\", "/")

    status_file_path = cache_dir .. "vlc_discord_status.json"
    vlc.msg.info("Discord RP: Status file at " .. status_file_path)

    local test_ok, test_err = pcall(function()
        local file = io.open(status_file_path, "w")
        if not file then
            return false, "Could not open file for writing"
        end
        file:write("{\"test\": true}")
        file:close()
        return true
    end)

    if not test_ok then
        vlc.msg.err("Discord RP: Error testing file write: " .. tostring(test_err))
        return false
    end

    return true
end

function activate()
    vlc.msg.info("Discord RP: Attempting to activate")

    local vlc_version
    pcall(function()
        if vlc.misc and vlc.misc.version then
            vlc_version = vlc.misc.version()
        else
            vlc_version = "unknown"
        end
    end)
    vlc.msg.info("Discord RP: Running on VLC version " .. tostring(vlc_version))

    local setup_ok, setup_err = pcall(setup_status_file)
    if not setup_ok then
        vlc.msg.err("Discord RP: Error in setup_status_file: " .. tostring(setup_err))
        return false
    end

    presence_active = true

    local write_ok, write_err = pcall(write_status, {
        active = true,
        status = "stopped",
        timestamp = os.time()
    })

    if not write_ok then
        vlc.msg.err("Discord RP: Error writing initial status: " .. tostring(write_err))
        return false
    end

    vlc.msg.info("Discord RP: Successfully activated")
    return true
end

function deactivate()
    vlc.msg.info("Discord RP deactivated")
    presence_active = false

    pcall(write_status, {
        active = false,
        status = "stopped",
        timestamp = os.time()
    })
end

function menu()
    return {"Update now", "About"}
end

function trigger_menu(id)
    if id == 1 then
        update_presence()
    elseif id == 2 then
        show_credits()
    end
end

function show_credits()
    local d = vlc.dialog("About Discord Rich Presence")

    -- Combine all HTML content into a single element
    local html_content = [[
        <h1>Discord Rich Presence for VLC</h1>
        <p><b>Version:</b> ]] .. discord_ext_info.version .. [[</p>
        <p><b>Author:</b> ]] .. discord_ext_info.author .. [[</p>
        <p>]] .. discord_ext_info.description .. [[</p>
        <p><a href=']] .. discord_ext_info.url .. [['>]] .. discord_ext_info.url .. [[</a></p>
    ]]

    d:add_html(html_content, 1, 1, 4, 5)

    -- Add a close button
    d:add_button("Close", function()
        d:delete()
    end, 2, 6, 2, 1)

    d:show()
end

function write_status(status)
    if not status_file_path then
        vlc.msg.err("Discord RP: Status file path not defined")
        return false
    end

    debug_log("Writing status: " .. tostring(status.status or "nil"))

    local file, err = io.open(status_file_path, "w")
    if not file then
        vlc.msg.err("Discord RP: Error opening file: " .. tostring(err))
        return false
    end

    local function table_to_json(t, indent)
        indent = indent or 0
        local spaces = string.rep("  ", indent)
        local json = "{\n"

        local keys = {}
        for k in pairs(t) do
            table.insert(keys, k)
        end
        table.sort(keys) -- Sort for consistent output

        for i, k in ipairs(keys) do
            local v = t[k]
            json = json .. spaces .. "  \"" .. k .. "\": "

            if type(v) == "table" then
                json = json .. table_to_json(v, indent + 1)
            elseif type(v) == "string" then
                -- Escape special characters in JSON strings
                local escaped = v:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r')
                json = json .. "\"" .. escaped .. "\""
            elseif type(v) == "number" or type(v) == "boolean" then
                json = json .. tostring(v)
            else
                json = json .. "\"" .. tostring(v) .. "\""
            end

            if i < #keys then
                json = json .. ",\n"
            else
                json = json .. "\n"
            end
        end

        return json .. spaces .. "}"
    end

    local write_ok, write_err = pcall(function()
        file:write(table_to_json(status))
        file:close()
    end)

    if not write_ok then
        vlc.msg.err("Discord RP: Error writing: " .. tostring(write_err))
        return false
    end

    return true
end

function detect_media_type(input_item)
    local media_type = "unknown"

    -- Check if we have artist or album metadata (likely audio)
    local metas = input_item:metas() or {}
    if metas["artist"] or metas["album"] then
        return "audio"
    end

    -- Check file extension
    local uri = input_item:uri() or ""
    local extension = uri:match("%.([^%.]+)$")

    if extension then
        extension = extension:lower()

        -- Common audio formats
        local audio_extensions = {
            mp3 = true,
            wav = true,
            ogg = true,
            flac = true,
            aac = true,
            m4a = true,
            wma = true,
            aiff = true,
            alac = true
        }

        -- Common video formats
        local video_extensions = {
            mp4 = true,
            mkv = true,
            avi = true,
            mov = true,
            wmv = true,
            flv = true,
            webm = true,
            m4v = true,
            mpg = true,
            mpeg = true,
            ts = true,
            ["3gp"] = true,
            asf = true,
            rm = true
        }

        if audio_extensions[extension] then
            return "audio"
        elseif video_extensions[extension] then
            return "video"
        end
    end

    -- Check media information
    local info = input_item:info() or {}

    -- Look for video track in the streams
    if info["Stream 0"] then
        for k, v in pairs(info["Stream 0"]) do
            if k:lower():match("video") then
                return "video"
            end
        end
    end

    -- If we have an audio codec but no detected video
    if info["Audio"] or info["Stream 0"] and info["Stream 0"]["Codec"] and
        info["Stream 0"]["Codec"]:lower():match("audio") then
        return "audio"
    end

    -- Default to video for streaming URLs
    if uri:match("^https?://") then
        return "video"
    end

    return media_type
end

function update_presence()
    debug_log("Updating presence")

    if not presence_active then
        return
    end

    if not vlc.input.is_playing() then
        write_status({
            active = true,
            status = "stopped",
            timestamp = os.time()
        })
        return
    end

    local input_item = nil
    local success = pcall(function()
        input_item = vlc.input.item()
    end)

    if not success or not input_item then
        debug_log("Could not retrieve playback item")
        write_status({
            active = true,
            status = "stopped",
            timestamp = os.time()
        })
        return
    end

    local filename = input_item:uri():match("([^/\\]+)%.%w+$") or ""
    local metas = input_item:metas() or {}
    local title = metas["title"] or input_item:name() or filename
    local artist = metas["artist"] or ""
    local album = metas["album"] or ""
    local duration = input_item:duration() or 0

    -- Detect media type
    local media_type = detect_media_type(input_item)
    debug_log("Detected media type: " .. media_type)

    -- For videos, use showName if available, otherwise title, and finally filename
    if media_type == "video" then
        title = metas["showName"] or metas["title"] or input_item:name() or filename
    end

    local input = vlc.object.input()
    local is_playing = true
    local position = 0
    local rate = 1.0
    local audio_delay = 0

    if input then
        local state = vlc.var.get(input, "state")
        is_playing = (state == 2)

        position = 0
        pcall(function()
            position = math.floor(vlc.var.get(input, "time") / 1000000)
        end)

        pcall(function()
            rate = vlc.var.get(input, "rate")
        end)

        pcall(function()
            audio_delay = vlc.var.get(input, "audio-delay") / 1000000
        end)
    end

    local now_playing = {
        title = title,
        artist = artist,
        album = album,
        genre = metas["genre"] or "",
        track_number = metas["track_number"] or "",
        date = metas["date"] or ""
    }

    -- Get format information
    local format = ""
    local info = input_item:info() or {}
    if info["General"] then
        for k, v in pairs(info["General"]) do
            if k:lower():match("format") then
                format = v
                break
            end
        end
    end

    -- Get resolution for videos
    local width, height = 0, 0
    if media_type == "video" and info["Video 0"] then
        for k, v in pairs(info["Video 0"]) do
            if k:lower():match("resolution") then
                width, height = v:match("(%d+)x(%d+)")
                break
            end
        end
    end

    local status = {
        active = true,
        status = is_playing and "playing" or "paused",
        media_type = media_type,
        media = {
            title = title,
            artist = artist,
            album = album,
            genre = now_playing.genre,
            track_number = now_playing.track_number,
            year = now_playing.date,
            format = format
        },
        playback = {
            duration = math.floor(duration),
            position = position,
            remaining = math.max(0, math.floor(duration) - position),
            rate = rate,
            audio_delay = audio_delay
        },
        video_info = media_type == "video" and {
            width = tonumber(width) or 0,
            height = tonumber(height) or 0
        } or nil,
        timestamp = os.time()
    }

    write_status(status)
end

function input_changed()
    debug_log("input_changed event")
    update_presence()
end

function meta_changed()
    debug_log("meta_changed event")
    update_presence()
end

function playing_changed()
    debug_log("playing_changed event")
    update_presence()
end

function playlist_changed()
    debug_log("playlist_changed event")
    update_presence()
end
