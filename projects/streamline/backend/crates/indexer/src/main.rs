//! StreamLine indexer: ingests on-chain events into Postgres and serves a
//! REST + WebSocket API the frontend reads for live stream state.

mod api;
mod config;
mod db;
mod poller;
mod state;

use config::Config;
use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,sqlx=warn".into()),
        )
        .init();

    let config = Config::from_env();
    tracing::info!(
        network_rpc = %config.sui_rpc_url,
        package = %config.package_id,
        "starting streamline-indexer"
    );

    let pool = db::connect(&config.database_url).await?;
    db::init_schema(&pool).await?;
    tracing::info!("postgres connected, schema ready");

    let state = AppState::new(pool, config.clone());

    // Background event ingestion.
    let poller_state = state.clone();
    tokio::spawn(async move { poller::run(poller_state).await });

    let app = api::router(state);
    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
