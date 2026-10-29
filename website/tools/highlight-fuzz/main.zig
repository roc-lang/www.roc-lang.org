//! Local reference process. JSON Lines in/out; source is checked, never executed.
const std = @import("std");
const parse = @import("parse");
const can = @import("can");
const lsp = @import("lsp");
const compile = @import("compile");
extern "c" fn getchar() c_int;
extern "c" fn write(c_int, [*]const u8, usize) isize;
const Request = struct { id: u64 = 0, source: []const u8, check: bool = true, builtin: bool = false };
const Lexical = struct { start: u32, end: u32, tag: []const u8, type: []const u8 };
const Semantic = struct { start: u32, end: u32, type: []const u8, modifiers: u32 };
const Response = struct { id: u64, confidence: []const u8, lexical: []const Lexical, semantic: []const Semantic, diagnostics: []const []const u8 };

pub fn main(init: std.process.Init) !void {
    const io = init.io;
    const gpa = init.gpa;
    const tmp = try std.fmt.allocPrint(gpa, "/tmp/roc-highlight-{d}", .{std.c.getpid()});
    defer gpa.free(tmp);
    try std.Io.Dir.cwd().createDirPath(io, tmp);
    defer std.Io.Dir.cwd().deleteTree(io, tmp) catch {};
    const path = try std.fs.path.join(gpa, &.{ tmp, "Main.roc" });
    defer gpa.free(path);
    var line: std.ArrayList(u8) = .empty;
    defer line.deinit(gpa);
    while (true) {
        const c = getchar();
        if (c == -1) break;
        if (c != 10) {
            try line.append(gpa, @intCast(c));
            continue;
        }
        var arena = std.heap.ArenaAllocator.init(gpa);
        defer arena.deinit();
        const a = arena.allocator();
        const request = try std.json.parseFromSlice(Request, a, line.items, .{ .ignore_unknown_fields = true });
        const response = try evaluate(a, io, path, request.value);
        const bytes = try std.json.Stringify.valueAlloc(a, response, .{});
        var sent: usize = 0;
        while (sent < bytes.len) {
            const n = write(1, bytes.ptr + sent, bytes.len - sent);
            if (n <= 0) return error.WriteFailed;
            sent += @intCast(n);
        }
        if (write(1, "\n", 1) != 1) return error.WriteFailed;
        line.clearRetainingCapacity();
    }
}
fn evaluate(a: std.mem.Allocator, io: std.Io, path: []const u8, request: Request) !Response {
    var env = try can.ModuleEnv.init(a, request.source);
    defer env.deinit();
    const ast = try parse.file(a, &env.common);
    defer ast.deinit();
    var lexical: std.ArrayList(Lexical) = .empty;
    for (ast.tokens.tokens.items(.tag), ast.tokens.tokens.items(.region)) |tag, region| {
        if (region.start.offset == region.end.offset) continue;
        try lexical.append(a, .{ .start = region.start.offset, .end = region.end.offset, .tag = @tagName(tag), .type = @tagName(tag.highlightCategory()) });
    }
    var info = try lsp.position.LineOffsets.init(a, request.source);
    defer info.deinit();
    var confidence: []const u8 = "parse";
    var diagnostics: std.ArrayList([]const u8) = .empty;
    var tokens: []lsp.semantic_tokens.SemanticToken = undefined;
    var built = try compile.BuildEnv.init(a, .single_threaded, 1, @import("roc_target").RocTarget.detectNative(), "/", io);
    defer built.deinit();
    built.setPostCheckPublicationMode(.none);
    // Highlighting needs checked CIR only. Do not finalize compile-time values
    // or enter lowering/backends while evaluating arbitrary fuzz source.
    built.defer_post_check = true;
    var checked_env: ?*can.ModuleEnv = null;
    if (request.builtin) {
        checked_env = built.builtin_modules.builtin_module.env;
        if (!std.mem.eql(u8, request.source, checked_env.?.common.source)) return error.BuiltinSourceMismatch;
    }
    if (request.check and ast.tokenize_diagnostics.items.len == 0 and ast.parse_diagnostics.items.len == 0) {
        try std.Io.Dir.cwd().writeFile(io, .{ .sub_path = path, .data = request.source });
        var build_failed = false;
        built.build(path) catch |err| {
            build_failed = true;
            try diagnostics.append(a, @errorName(err));
        };
        const reports = try built.drainReports();
        defer built.freeDrainedReports(reports);
        var rejected = build_failed;
        for (reports) |mod| for (mod.reports) |report| {
            try diagnostics.append(a, try a.dupe(u8, report.title));
            if (report.severity == .fatal or report.severity == .runtime_error) rejected = true;
        };
        // Deferred builds retain reports on coordinator modules; ordered sinks
        // are normally populated during finalization, which this tool skips.
        if (built.coordinator) |coordinator| {
            rejected = rejected or coordinator.hasUserErrors();
            var reports_iter = coordinator.iterReports();
            while (reports_iter.next()) |entry| {
                try diagnostics.append(a, try a.dupe(u8, entry.report.title));
            }
        }
        if (!rejected) {
            const modules = try built.getCompiledModules(a);
            for (modules) |mod| if (std.mem.eql(u8, mod.path, path)) {
                checked_env = mod.semantic.env;
                break;
            };
        }
    }
    if (checked_env) |module| {
        confidence = "checked";
        tokens = try lsp.semantic_tokens.extractSemanticTokensFromChecked(a, request.source, &info, module);
    } else tokens = try lsp.semantic_tokens.extractSemanticTokens(a, request.source, &info);
    if (ast.tokenize_diagnostics.items.len > 0) try diagnostics.append(a, "tokenizer diagnostics");
    if (ast.parse_diagnostics.items.len > 0) try diagnostics.append(a, "parse diagnostics");
    var semantic: std.ArrayList(Semantic) = .empty;
    for (tokens) |token| {
        const start = info.offsetAt(token.line, token.start_char) orelse continue;
        const end = info.offsetAt(token.line, token.start_char + token.length) orelse continue;
        try semantic.append(a, .{ .start = start, .end = end, .type = lsp.capabilities.TOKEN_TYPES[token.token_type], .modifiers = token.modifiers });
    }
    return .{ .id = request.id, .confidence = confidence, .lexical = lexical.items, .semantic = semantic.items, .diagnostics = diagnostics.items };
}
