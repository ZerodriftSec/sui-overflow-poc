#[test_only]
module subscriptions::version_tests {
    use subscriptions::version;

    /// Version constants match the v2.0.0 protocol release.
    #[test]
    fun test_version_constants() {
        assert!(version::version_major() == 2, 0);
        assert!(version::version_minor() == 0, 0);
        assert!(version::version_patch() == 0, 0);
    }

    /// `version()` returns the full `(major, minor, patch)` tuple in order.
    #[test]
    fun test_version_tuple_round_trip() {
        let (major, minor, patch) = version::version();
        assert!(major == version::version_major(), 0);
        assert!(minor == version::version_minor(), 0);
        assert!(patch == version::version_patch(), 0);
        assert!(major == 2 && minor == 0 && patch == 0, 0);
    }

    /// The `version_major_test` accessor agrees with the public `version_major`.
    #[test]
    fun test_version_major_test_matches_public() {
        assert!(version::version_major_test() == version::version_major(), 0);
    }
}
