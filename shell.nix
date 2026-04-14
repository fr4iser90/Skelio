# Entwicklungsshell für Skelio (Tauri + Vite) — `nix-shell` / `nix-shell --pure`.
#
#   nix-shell
#   nix-shell --run 'pnpm install && pnpm --filter @skelio/desktop tauri dev'
#
# Setzt PKG_CONFIG_PATH (glib, webkitgtk_4_1, …) und LD_LIBRARY_PATH, damit
# `cargo`/`tauri dev` nicht mit „Package glib-2.0 was not found“ / leerem PKG_CONFIG_PATH scheitern.
# zenity + kdialog: „Speichern (Editor)“-Dialog in der Tauri-App (Rust invoke).
{ pkgs ? import <nixpkgs> { } }:

let
  lib = pkgs.lib;

  tauriPkgConfig = lib.makeSearchPath "lib/pkgconfig" (
    with pkgs;
    [
      glib.dev
      gtk3.dev
      cairo.dev
      pango.dev
      gdk-pixbuf.dev
      atk.dev
      at-spi2-core.dev
      harfbuzz.dev
      fribidi.dev
      openssl.dev
      webkitgtk_4_1.dev
      libsoup_3.dev
      libxml2.dev
      sqlite.dev
      dbus.dev
      fontconfig.dev
      freetype.dev
      zlib.dev
    ]
  );

  runLibs = lib.makeLibraryPath (
    with pkgs;
    [
      gtk3
      webkitgtk_4_1
      glib
      libsoup_3
      atk
      cairo
      gdk-pixbuf
      pango
      harfbuzz
      fontconfig
      freetype
      zlib
      openssl
      dbus
    ]
  );

in
pkgs.mkShell {
  name = "skelio-tauri-dev";

  buildInputs = with pkgs; [
    pkg-config
    gcc
    cmake
    gnumake
    openssl
    gtk3
    webkitgtk_4_1
    libsoup_3
    glib
    zenity
    kdePackages.kdialog
    rustc
    cargo
    rustfmt
    clippy
    rust-analyzer
    nodejs_22
    pnpm
    curl
  ];

  shellHook = ''
    export PKG_CONFIG_PATH="${tauriPkgConfig}''${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
    export LD_LIBRARY_PATH="${runLibs}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    echo "[skelio shell] PKG_CONFIG_PATH + LD_LIBRARY_PATH; zenity/kdialog für Speichern (Editor)."
  '';
}
