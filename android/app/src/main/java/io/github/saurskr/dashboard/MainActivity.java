package io.github.saurskr.dashboard;

import android.content.Intent;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

// Google Drive needs the "drive.file" permission on top of sign-in. The sign-in plugin can only ask for extra permissions when the
// main screen passes Google's answer back to it, which is all this does.
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
  @Override
  public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}

  @Override
  public void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
      PluginHandle handle = getBridge().getPlugin("SocialLogin");
      if (handle == null) return;
      if (handle.getInstance() instanceof SocialLoginPlugin) {
        ((SocialLoginPlugin) handle.getInstance()).handleGoogleLoginIntent(requestCode, data);
      }
    }
  }
}
