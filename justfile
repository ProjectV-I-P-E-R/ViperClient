[group("Dev")]
dev:
    #!/usr/bin/env sh
    NIX_GL_CMD=""
    IFS=:
    for dir in $PATH; do
        for file in "$dir"/nixGLNvidia*; do
            if [ -x "$file" ] && [ -f "$file" ]; then
                NIX_GL_CMD="$file"
                break 2
            fi
        done
    done
    unset IFS

    if [ -n "$NIX_GL_CMD" ]; then
        exec "$NIX_GL_CMD" cargo tauri dev
    else
        exec cargo tauri dev
    fi

[group("Dev")]
clean:
    #!/usr/bin/env sh
    rm -rf ./dist
    rm -rf ./src-tauri/target

# Add a new shadcn component to the project
[group("Utils")]
add component_name:
    @bunx --bun shadcn@latest add {{ component_name }}
