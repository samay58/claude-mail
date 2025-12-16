# TUI Setup

This is the Go terminal interface component. For complete setup, see the main [README](../README.md).

## Quick Reference

### Build
```bash
cd tui
go build -o claudemail ./cmd/claudemail
```

### Run
```bash
./claudemail
```

### Requirements
- Go 1.21+
- Backend API running on port 5178

## Testing the Connection

```bash
# Check if backend is running
curl http://localhost:5178/health

# Expected response:
# {"ok":true,"timestamp":"..."}
```

## Troubleshooting

**"Cannot connect to agent"**
- Ensure backend is running: `cd ../backend && npm run agent`
- Check port 5178 is not in use: `lsof -i :5178`

**Build errors**
- Ensure Go 1.21+: `go version`
- Clear module cache: `go clean -modcache`
