package in.cricsynthesis.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends BridgeActivity {
    // UPI payment links from the payment window (checkout option webview_intent): opened in the customer's UPI app.
    // Only these schemes, and intent:// links that carry one of them, leave the app; everything else is handled as before.
    private static final Set<String> UPI = new HashSet<>(Arrays.asList(
        "upi", "tez", "gpay", "phonepe", "paytmmp", "paytm", "credpay", "bhim", "mobikwik", "amazonpay"));

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (openUpiApp(request.getUrl())) return true;
                return super.shouldOverrideUrlLoading(view, request);
            }
        });
    }

    private boolean openUpiApp(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        Intent intent;
        try {
            if (UPI.contains(scheme)) {
                intent = new Intent(Intent.ACTION_VIEW, uri);
            } else if (scheme.equals("intent")) {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                String inner = intent.getScheme() == null ? "" : intent.getScheme().toLowerCase();
                if (!UPI.contains(inner)) return false;
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
            } else {
                return false;
            }
        } catch (Exception e) {
            return false;
        }
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            // no UPI app for this link: stay on the payment window so another method can be chosen
        }
        return true;
    }
}
