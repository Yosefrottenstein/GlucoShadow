package expo.modules.deviceaccess

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Reads and opens the Android settings screens that a glucose alarm app needs:
// battery optimisation off, "Do not disturb" override, and exact alarms.
class DeviceAccessModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "App not ready", null)

  private fun open(intent: Intent) {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
  }

  override fun definition() = ModuleDefinition {
    Name("DeviceAccess")

    // true when GlucoShadow is exempt from battery optimisation (can keep running in the background)
    Function("batteryUnrestricted") {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    // shows the system "Allow GlucoShadow to always run in the background?" dialog
    Function("requestBatteryUnrestricted") {
      try {
        open(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + context.packageName)))
      } catch (e: Exception) {
        open(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
      }
    }

    // "Do not disturb access": lets urgent alarms sound while the phone is silent or on Do not disturb
    Function("dndAccess") {
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.isNotificationPolicyAccessGranted
    }
    Function("openDndAccess") {
      open(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))
    }

    // keeps the app running in the background (permanent quiet notification), like xDrip+
    Function("startKeepAlive") { title: String, text: String ->
      val intent = Intent(context, KeepAliveService::class.java).putExtra("title", title).putExtra("text", text)
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
    }
    Function("stopKeepAlive") {
      context.stopService(Intent(context, KeepAliveService::class.java))
    }

    // exact alarm timing (Android 12+)
    Function("exactAlarms") {
      if (Build.VERSION.SDK_INT < 31) true
      else (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
    }
    Function("openExactAlarms") {
      if (Build.VERSION.SDK_INT >= 31) {
        try {
          open(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName)))
        } catch (e: Exception) {
          open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName)))
        }
      }
    }
  }
}
