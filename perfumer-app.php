<?php
/*
 * Plugin Name: Perfumer App
 * Plugin URI: https://github.com/posekw/Perfumer-App
 * Description: تطبيق احترافي لحساب نسب العطور وتصميم التركيبات بناءً على قواعد علمية.
 * Version: 1.6.2
 * Author: Dhari Al-Tamimi
 * Author URI: https://github.com/posekw
 * Text Domain: perfumer-app
 */

if (!defined('ABSPATH')) {
    exit;
}

function perfumer_app_enqueue_assets()
{
    // Only enqueue if the shortcode is present on the page
    global $post;
    if (is_a($post, 'WP_Post') && has_shortcode($post->post_content, 'perfumer_app')) {

        wp_enqueue_style('perfumer-app-style', plugins_url('style.css', __FILE__));

        wp_enqueue_script('perfumer-app-js', plugins_url('app.js', __FILE__), array(), '1.6.1', true);

        // Pass the plugin directory URL to JavaScript
        wp_localize_script('perfumer-app-js', 'perfumerData', array(
            'pluginUrl' => plugins_url('/', __FILE__)
        ));
    }
}
add_action('wp_enqueue_scripts', 'perfumer_app_enqueue_assets');

function perfumer_app_shortcode()
{
    ob_start();
    include plugin_dir_path(__FILE__) . 'template.php';
    return ob_get_clean();
}
add_shortcode('perfumer_app', 'perfumer_app_shortcode');
