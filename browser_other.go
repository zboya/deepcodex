//go:build !darwin

package main

// openBrowserWindowNative 非 macOS 平台不支持原生 WebView 子窗口
// 调用方应检查返回值或直接走 BrowserOpenURL
func openBrowserWindowNative(url, title string, width, height int) {
	// no-op: caller should fallback to BrowserOpenURL
}

const nativeBrowserSupported = false
