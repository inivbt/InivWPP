import os

def create_project_map(root_path, accepted_extensions, ignored_files, ignored_dirs):
    """
    Creates a project map (mental map) of directories and files with accepted extensions,
    excluding specific ignored files and directories.

    Args:
        root_path (str): Root directory of the project.
        accepted_extensions (list): List of accepted file extensions (e.g., ['.js', '.py']).
        ignored_files (list): List of specific filenames to ignore (e.g., ['README.md']).
        ignored_dirs (list): List of directory names to ignore (e.g., ['node_modules']).

    Returns:
        dict: Dictionary representing the project structure.
    """
    project_structure = {}
    for root, dirs, files in os.walk(root_path):
        # Exclude ignored directories
        dirs[:] = [d for d in dirs if d not in ignored_dirs]

        # Relative path from root_path
        rel_path = os.path.relpath(root, root_path)
        if rel_path == ".":
            rel_path = "./" 
        else:
            rel_path = f"./{rel_path.replace(os.sep, '/')}"

        # Filter files based on accepted extensions and ignored filenames
        filtered_files = [
            f for f in files
            if os.path.splitext(f)[1] in accepted_extensions and f not in ignored_files
        ]

        if filtered_files:
            project_structure[rel_path] = {
                'directories': dirs,
                'files': filtered_files
            }

    return project_structure

def write_output_log(root_path, output_file, accepted_extensions, ignored_files, ignored_dirs, project_structure):
    """
    Writes the paths and contents of accepted files to the output log,
    followed by the project map.

    Args:
        root_path (str): Root directory of the project.
        output_file (str): Name of the output log file.
        accepted_extensions (list): List of accepted file extensions.
        ignored_files (list): List of specific filenames to ignore.
        ignored_dirs (list): List of directory names to ignore.
        project_structure (dict): Dictionary representing the project structure.
    """
    with open(output_file, 'w', encoding='utf-8') as log_file:
        for root, dirs, files in os.walk(root_path):
            # Exclude ignored directories
            dirs[:] = [d for d in dirs if d not in ignored_dirs]

            # Filter files based on accepted extensions and ignored filenames
            filtered_files = [
                f for f in files
                if os.path.splitext(f)[1] in accepted_extensions and f not in ignored_files
            ]

            for file in filtered_files:
                # Full path to the file
                file_path = os.path.join(root, file)
                # Relative path for logging
                rel_path = os.path.relpath(file_path, root_path)
                rel_path = f"./{rel_path.replace(os.sep, '/')}"

                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                except Exception as e:
                    content = f"Error reading file: {e}"

                # Write to log
                log_file.write(f"{rel_path}\n")
                log_file.write(f"{content}\n\n")

        # After writing all files, append the project map
        log_file.write("Project Structure Map:\n")
        log_file.write("----------------------\n")
        for path, contents in project_structure.items():
            log_file.write(f"{path}\n")
            # Print subdirectories
            for directory in contents['directories']:
                log_file.write(f"  ├── {directory}/\n")
            # Print files
            for file in contents['files']:
                log_file.write(f"  ├── {file}\n")
            log_file.write("\n")

    print(f"File '{output_file}' has been successfully created.")

def print_project_map(project_structure, indent=0):
    """
    Prints the project map to the console.

    Args:
        project_structure (dict): Dictionary representing the project structure.
        indent (int): Indentation level for printing.
    """
    for path, contents in project_structure.items():
        print(' ' * indent + path)
        # Print subdirectories
        for directory in contents['directories']:
            print(' ' * (indent + 2) + f"├── {directory}/")
        # Print files
        for file in contents['files']:
            print(' ' * (indent + 2) + f"├── {file}")
        print()

def main():
    # Define the root path of the project (modify as needed)
    print('start')
    root_path = os.getcwd()  # Uses the current working directory
    output_file = 'output.log'

    # Define the list of accepted file extensions
    accepted_extensions = ['.js', '.json', '.lua', '.otui']  # Add or remove extensions as needed

    # Define the list of specific filenames to ignore
    ignored_files = ['allItems.json', 'allItems.lua', 'output.log', 'package-lock.json']  # Add or remove filenames as needed

    # Define the list of specific directory names to ignore
    ignored_dirs = ['sessions','node_modules', 'painel', 'login', 'register', '__pycache__', '.git']  # Add or remove directories as needed

    # Create the project map
    project_structure = create_project_map(root_path, accepted_extensions, ignored_files, ignored_dirs)

    # Write the log file with file contents and project map
    write_output_log(root_path, output_file, accepted_extensions, ignored_files, ignored_dirs, project_structure)

    # Optional: Print the project map to the console
    print("\nProject Structure Map:")
    print("----------------------")
    print_project_map(project_structure)

if __name__ == "__main__":
    main()
