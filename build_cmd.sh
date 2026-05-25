mkdir -p build/bin/cmd
echo "Building deepcodex command..."
go build -o build/bin/cmd/deepcodex agent/cmd/main.go
echo "Build completed. The deepcodex command is located at build/bin/cmd/deepcodex"