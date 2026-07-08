package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/andybalholm/brotli"
	"github.com/klauspost/compress/zstd"
)

func main() {
	quality, inputPath, outputPath, err := parseArgs(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		fmt.Fprintln(os.Stderr, "usage: wasm-brotli --quality 1..11 input.wasm[.zst] output.wasm.br")
		os.Exit(2)
	}

	if err := compress(quality, inputPath, outputPath); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func parseArgs(args []string) (int, string, string, error) {
	if len(args) != 4 || args[0] != "--quality" {
		return 0, "", "", fmt.Errorf("invalid arguments")
	}

	quality, err := strconv.Atoi(args[1])
	if err != nil || quality < 0 || quality > 11 {
		return 0, "", "", fmt.Errorf("quality must be an integer from 0 through 11")
	}

	return quality, args[2], args[3], nil
}

func compress(quality int, inputPath, outputPath string) error {
	input, err := os.Open(inputPath)
	if err != nil {
		return err
	}
	defer input.Close()

	var reader io.Reader = input
	var zstdReader *zstd.Decoder
	if strings.HasSuffix(inputPath, ".zst") {
		zstdReader, err = zstd.NewReader(input)
		if err != nil {
			return err
		}
		defer zstdReader.Close()
		reader = zstdReader
	}

	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return err
	}

	tmpPath := outputPath + ".tmp"
	output, err := os.Create(tmpPath)
	if err != nil {
		return err
	}

	writer := brotli.NewWriterOptions(output, brotli.WriterOptions{
		Quality: quality,
		LGWin:   24,
	})

	_, copyErr := io.Copy(writer, reader)
	closeWriterErr := writer.Close()
	closeOutputErr := output.Close()

	if copyErr != nil {
		os.Remove(tmpPath)
		return copyErr
	}
	if closeWriterErr != nil {
		os.Remove(tmpPath)
		return closeWriterErr
	}
	if closeOutputErr != nil {
		os.Remove(tmpPath)
		return closeOutputErr
	}

	return os.Rename(tmpPath, outputPath)
}
