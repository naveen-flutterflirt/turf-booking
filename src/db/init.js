const db = require('../config/db');

const createTables = async () => {
  const query = `
    DROP TABLE IF EXISTS turf_feedbacks CASCADE;
    DROP TABLE IF EXISTS turf_amenities CASCADE;
    DROP TABLE IF EXISTS amenities CASCADE;
    DROP TABLE IF EXISTS turf_sports CASCADE;
    DROP TABLE IF EXISTS turf_images CASCADE;
    DROP TABLE IF EXISTS sports CASCADE;
    DROP TABLE IF EXISTS turfs CASCADE;
    DROP TABLE IF EXISTS owners CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS owner_queries CASCADE;

    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone VARCHAR(20),
      role VARCHAR(50) DEFAULT 'CUSTOMER',
      status VARCHAR(50) DEFAULT 'ACTIVE',
      is_verified BOOLEAN DEFAULT FALSE,
      verification_code VARCHAR(6),
      verification_code_expires TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE owners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      business_name VARCHAR(255) NOT NULL,
      account_name VARCHAR(255),
      account_number VARCHAR(255),
      ifsc_code VARCHAR(50),
      bank_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE owner_queries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
      subject VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      admin_reply TEXT,
      status VARCHAR(50) DEFAULT 'PENDING',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE turfs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      address TEXT NOT NULL,
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100),
      pincode VARCHAR(20),
      latitude DECIMAL(10, 8),
      longitude DECIMAL(11, 8),
      price_per_hour DECIMAL(10, 2) NOT NULL,
      opening_time TIME NOT NULL,
      closing_time TIME NOT NULL,
      status VARCHAR(50) DEFAULT 'PENDING',
      is_open BOOLEAN DEFAULT TRUE,
      is_featured BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE sports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) UNIQUE NOT NULL,
      icon VARCHAR(255),
      status VARCHAR(50) DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE amenities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) UNIQUE NOT NULL,
      icon VARCHAR(255),
      status VARCHAR(50) DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE turf_images (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      s3_key TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE turf_sports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
      sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
      UNIQUE(turf_id, sport_id)
    );

    CREATE TABLE turf_amenities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
      amenity_id UUID NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
      UNIQUE(turf_id, amenity_id)
    );

    CREATE TABLE bookings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      booking_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      status VARCHAR(50) DEFAULT 'PAYMENT_PENDING',
      total_price DECIMAL(10, 2) NOT NULL,
      razorpay_order_id VARCHAR(255),
      razorpay_payment_id VARCHAR(255),
      razorpay_signature VARCHAR(255),
      payment_method VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE turf_feedbacks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
      comment TEXT,
      image1_url TEXT,
      image2_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(booking_id)
    );

    CREATE TABLE notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(50) NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    console.log('Dropping and re-creating all tables with full schema...');
    await db.query(query);
    console.log('Tables created successfully!');
  } catch (err) {
    console.error('Error creating tables:', err);
  } finally {
    db.pool.end();
  }
};

createTables();
