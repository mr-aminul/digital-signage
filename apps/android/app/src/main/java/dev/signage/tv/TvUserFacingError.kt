/**
 * Support correlation codes for logs and cloud telemetry. On-device UI uses plain language
 * in [TvStandbyBrandingScreen]; details stay in logcat.
 */
object TvUserFacingError {
    const val CONFIG_INCOMPLETE = "E-001"
    const val STARTUP_FAILED = "E-002"
    const val RELAUNCH_TO_PAIR = "E-005"
}
