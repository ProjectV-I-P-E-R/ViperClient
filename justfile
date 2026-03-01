[group("Dev")]
dev:
    @cargo tauri dev

# Add a new shadcn component to the project
[group("Utils")]
add component_name:
    @bunx --bun shadcn@latest add {{ component_name }}