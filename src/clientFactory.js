const { promisify } = require( "util" );

const tedious = require( "tedious" );
const genericPool = require( "generic-pool" );

const Client = require( "./client" );

function promisifyConnection( conn ) {
	const originalBeginTransaction = conn.beginTransaction;

	Object.assign( conn, {
		beginTransaction( name, isolationLevel ) {
			return new Promise( ( resolve, reject ) => {
				const cb = err => {
					if ( err ) {
						return reject( err );
					}
					return resolve();
				};
				originalBeginTransaction.call( conn, cb, name, isolationLevel );
			} );
		},
		commitTransaction: promisify( conn.commitTransaction ),
		rollbackTransaction: promisify( conn.rollbackTransaction )
	} );
}

function buildConfigs( config ) {
	const poolConfig = Object.assign( { min: 1, max: 10 }, ( config.pool || {} ) );
	// poolConfig.testOnBorrow = true //TODO: reset connection?

	const { username, password, server, domain, port, database } = config;
	const tediousConfig = {
		userName: username,
		password,
		server,
		domain,
		options: {
			port,
			database
		}
	};

	return {
		pool: poolConfig,
		tedious: tediousConfig
	};
}

// TODO: timeouts
function connect( config ) {
	const configs = buildConfigs( config );
	const factory = {
		create() {
			return new Promise( ( resolve, reject ) => {
				const conn = new tedious.Connection( configs.tedious );
				promisifyConnection( conn );

				conn.on( "connect", err => {
					if ( err ) {
						return reject( err );
					}
					return resolve( conn );
				} );
			} );
		},
		destroy( conn ) {
			return new Promise( resolve => {
				conn.on( "end", () => {
					resolve();
				} );
				conn.close();
			} );
		}
	};

	const pool = genericPool.createPool( factory, configs.pool );

	return new Client( pool );
}
module.exports = {
	connect
};
