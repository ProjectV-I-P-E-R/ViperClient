use std::env;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo:rerun-if-changed=proto/viper.proto");

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let descriptor_path = out_dir.join("viper_descriptor.bin");

    tonic_prost_build::configure()
        .build_server(false)
        .build_client(true)
        .compile_well_known_types(true)
        .extern_path(".google.protobuf", "::pbjson_types")
        .file_descriptor_set_path(&descriptor_path)
        .compile_protos(&["proto/viper.proto"], &["proto"])?;

    pbjson_build::Builder::new()
        .register_descriptors(&std::fs::read(descriptor_path)?)?
        .build(&[".viper"])?;

    tauri_build::build();

    Ok(())
}
