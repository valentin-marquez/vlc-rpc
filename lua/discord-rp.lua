local presence_active = false
local status_file_path = nil
local debug_mode = true

function debug_log(message)
    if debug_mode then
        vlc.msg.info("Discord RP Debug: " .. tostring(message))
    end
end

function descriptor()
    return {
        title = "Discord Rich Presence",
        version = "1.1.0",
        author = "Valentin Marquez",
        url = 'https://github.com/valentin-marquez/vlc-discord-rp',
        shortdesc = "Discord RP",
        description = "Display your currently playing media in Discord Rich Presence",
        capabilities = {"menu","input-listener", "meta-listener", "playing-listener", "playlist-listener"}
    }
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
        status = "idle",
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
    local d = vlc.dialog("About")
    d:add_label("Discord Rich Presence for VLC", 1, 1, 3, 1)
    d:add_label("by Valentin Marquez", 1, 2, 3, 1)
    d:add_label("Version 1.1.0", 1, 2, 3, 1)
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

        for i, k in ipairs(keys) do
            local v = t[k]
            json = json .. spaces .. "  \"" .. k .. "\": "

            if type(v) == "table" then
                json = json .. table_to_json(v, indent + 1)
            elseif type(v) == "string" then
                json = json .. "\"" .. v:gsub('"', '\\"') .. "\""
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

        if json:sub(-2) == ",\n" then
            json = json:sub(1, -3) .. "\n"
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

function update_presence()
    debug_log("Updating presence")

    if not presence_active then
        return
    end

    if not vlc.input.is_playing() then
        write_status({
            active = false,
            status = "stopped",
            timestamp = os.time()
        })
        return
    end

    local input_item = nil
    local success = pcall(function()
        input_item = vlc.input.item()
        input_item = vlc.input.item()
    end)

    if not success or not input_item then
        debug_log("Could not retrieve playback item")
        write_status({
            active = true,
            status = "idle",
            timestamp = os.time()
        })
        return
    end

    local title = input_item:name() or "Unknown"
    local metas = input_item:metas() or {}
    local artist = metas["artist"] or ""
    local album = metas["album"] or ""

    local duration = input_item:duration() or 0

    local input = vlc.object.input()
    local is_playing = true
    local position = 0
    local rate = 1.0
    local audio_delay = 0

    if input then
        local state = vlc.var.get(input, "state")
        is_playing = (state == 2)

        position = math.floor(vlc.var.get(input, "time") / 1000000)
        rate = vlc.var.get(input, "rate")
        audio_delay = vlc.var.get(input, "audio-delay") / 1000000
    end

    local now_playing = {
        title = title,
        artist = artist,
        album = album,
        genre = metas["genre"] or "",
        track_number = metas["track_number"] or "",
        date = metas["date"] or ""
    }

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

    local status = {
        active = true,
        status = is_playing and "playing" or "paused",
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
            remaining = math.floor(duration) - position,
            rate = rate,
            audio_delay = audio_delay
        },
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
