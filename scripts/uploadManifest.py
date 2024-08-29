import subprocess
import json
import os

def run_ardrive_command():
    command = "ardrive upload-file -w /Users/dylanshade/Developer/arWallet.json -f /Users/dylanshade/Developer/AO/4vrtiny/dist -d 4vrtiny"
    result = subprocess.run(command, shell=True, capture_output=True, text=True)
    return result.stdout

def parse_output(output):
    data = json.loads(output)
    file_data = {}
    for entity in data['created']:
        if entity['type'] == 'file':
            file_path = os.path.relpath(entity['sourceUri'], '/Users/dylanshade/Developer/AO/4vrtiny/dist')
            file_path = file_path.replace('\\', '/')  # Ensure forward slashes for paths
            file_data[file_path] = entity['dataTxId']
    return file_data

def create_manifest(file_data):
    manifest = {
        "manifest": "arweave/paths",
        "version": "0.2.0",
        "index": {
            "path": "index.html"
        },
        "paths": {}
    }

    for path, tx_id in file_data.items():
        manifest["paths"][path] = {"id": tx_id}

    # Set fallback to index.html if it exists
    if "index.html" in file_data:
        manifest["fallback"] = {"id": file_data["index.html"]}

    return manifest

def main():
    # Run ArDrive command
    output = run_ardrive_command()

    # Parse the output
    file_data = parse_output(output)

    # Create the manifest
    manifest = create_manifest(file_data)

    # Print the manifest
    print(json.dumps(manifest, indent=4))

    # Optionally, save the manifest to a file
    with open('../manifest.json', 'w') as f:
        json.dump(manifest, f, indent=4)

if __name__ == "__main__":
    main()
