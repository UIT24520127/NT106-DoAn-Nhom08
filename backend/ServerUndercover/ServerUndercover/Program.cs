using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Firebase.Auth;
using Firebase.Auth.Providers;

var builder = WebApplication.CreateBuilder(args);

// ============ GIAI ĐOẠN 1: CHUẨN BỊ (BUILDER.SERVICES) ============

// 1. Đăng ký Controller & SignalR
builder.Services.AddControllers();
builder.Services.AddSignalR();
builder.Services.AddSingleton<ServerUndercover.Services.MatchmakingService>();

// 2. Cấu hình Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// 3. Cấu hình CORS cho Next.js
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowNextJs", policy =>
    {
        policy.SetIsOriginAllowed(origin => new Uri(origin).Host == "localhost" || new Uri(origin).Host == "127.0.0.1") // Cho phép tất cả các cổng localhost
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials(); // Bắt buộc phải có dòng này cho SignalR
    });
});

// 4. Cấu hình Firebase
var config = new FirebaseAuthConfig
{
    ApiKey = "AIzaSyDjYibTklIP4LZHn5JleaQsY6ut5qzSfJs",
    AuthDomain = "game-undercover-d70dd.firebaseapp.com",
    Providers = new FirebaseAuthProvider[] { new EmailProvider() }
};
var authClient = new FirebaseAuthClient(config);
builder.Services.AddSingleton<FirebaseAuthClient>(authClient);


// ============ GIAI ĐOẠN 2: KHỞI TẠO ỨNG DỤNG ============
var app = builder.Build();


// ============ GIAI ĐOẠN 3: CẤU HÌNH PIPELINE (APP) ============

// Bật Swagger UI
app.UseSwagger();
app.UseSwaggerUI();

// Bật CORS (Bắt buộc phải đứng TRƯỚC MapControllers và MapHub)
app.UseCors("AllowNextJs");

// Map các đường dẫn
app.MapControllers();
app.MapHub<ServerUndercover.Hubs.GameHub>("/gamehub");

// Chạy Server (Chỉ có 1 lệnh Run duy nhất ở cuối file)
app.Run();