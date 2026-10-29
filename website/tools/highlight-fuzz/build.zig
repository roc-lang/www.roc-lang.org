const std = @import("std");
pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.option(std.builtin.OptimizeMode, "optimize", "Reference build mode") orelse .safe;
    const roc = b.dependency("roc", .{ .target = target, .optimize = optimize });
    const exe = b.addExecutable(.{ .name = "roc-highlight-reference", .root_module = b.createModule(.{
        .root_source_file = b.path("main.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    }) });
    inline for (.{ "parse", "can", "base", "lsp", "compile", "roc_target" }) |name| exe.root_module.addImport(name, roc.module(name));
    b.installArtifact(exe);
}
