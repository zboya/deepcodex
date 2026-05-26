//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework WebKit

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

void openWebViewWindow(const char *urlStr, const char *title, int width, int height) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSString *nsURL = [NSString stringWithUTF8String:urlStr];
        NSString *nsTitle = title ? [NSString stringWithUTF8String:title] : nsURL;

        NSRect frame = NSMakeRect(0, 0, width, height);
        NSWindow *window = [[NSWindow alloc]
            initWithContentRect:frame
            styleMask:(NSWindowStyleMaskTitled |
                       NSWindowStyleMaskClosable |
                       NSWindowStyleMaskResizable |
                       NSWindowStyleMaskMiniaturizable)
            backing:NSBackingStoreBuffered
            defer:NO];

        [window setTitle:nsTitle];
        [window center];

        WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
        WKWebView *webView = [[WKWebView alloc] initWithFrame:frame configuration:config];
        NSURL *url = [NSURL URLWithString:nsURL];
        if (url) {
            [webView loadRequest:[NSURLRequest requestWithURL:url]];
        }

        [window setContentView:webView];
        [window makeKeyAndOrderFront:nil];

        // 让窗口关闭时自动释放
        [window setReleasedWhenClosed:YES];
    });
}
*/
import "C"
import "unsafe"

const nativeBrowserSupported = true

// openBrowserWindowNative 使用 macOS 原生 WKWebView 打开一个新窗口
func openBrowserWindowNative(url, title string, width, height int) {
	cURL := C.CString(url)
	defer C.free(unsafe.Pointer(cURL))
	cTitle := C.CString(title)
	defer C.free(unsafe.Pointer(cTitle))
	C.openWebViewWindow(cURL, cTitle, C.int(width), C.int(height))
}
