using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Firebase.Auth;
using Firebase.Auth.Providers;
using Google.Cloud.Firestore;
using ServerUndercover.Controllers;
using ServerUndercover.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;

var credentialsFileName = "game-undercover-d70dd-firebase-adminsdk-fbsvc-a08a981514.json";
var credentialsPath = Path.Combine(AppContext.BaseDirectory, credentialsFileName);
// Fallback: tìm từ thư mục project nếu chạy từ dotnet run
if (!File.Exists(credentialsPath))
{
    credentialsPath = Path.Combine(Directory.GetCurrentDirectory(), credentialsFileName);
}
// Diagnostic output to help debug credential file resolution
Console.WriteLine("[DEBUG] AppContext.BaseDirectory: " + AppContext.BaseDirectory);
Console.WriteLine("[DEBUG] CurrentDirectory: " + Directory.GetCurrentDirectory());
Console.WriteLine("[DEBUG] Resolved credentialsPath: " + credentialsPath);
Console.WriteLine("[DEBUG] credentials file exists: " + File.Exists(credentialsPath));
Environment.SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", credentialsPath);

FirebaseApp.Create(new AppOptions()
{
    Credential = GoogleCredential.GetApplicationDefault(),
});

var builder = WebApplication.CreateBuilder(args);

// ============ GIAI ĐOẠN 1: CHUẨN BỊ (BUILDER.SERVICES) ============

// 1. Đăng ký Controller & SignalR
builder.Services.AddControllers();
builder.Services.AddSignalR();
builder.Services.AddSingleton<ServerUndercover.Services.RoomManagerService>();
builder.Services.AddMemoryCache(); // 👈 Thêm để cache đăng ký tạm thời

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

// 3.5 Cấu hình Authentication với Firebase JWT
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://securetoken.google.com/game-undercover-d70dd";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "https://securetoken.google.com/game-undercover-d70dd",
            ValidateAudience = true,
            ValidAudience = "game-undercover-d70dd",
            ValidateLifetime = true
        };

        // Lấy token từ URL queries request để sử dụng cho SignalR
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/gamehub"))
                {
                    // Lấy token từ query gán cho request
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

// Đăng ký Service vào DI Container
builder.Services.AddScoped<IUserService, UserService>();

// --- PHẦN FIRESTORE (Cần thêm vào) ---
// Thay "your-project-id" bằng ID thật của bạn (ví dụ: game-undercover-d70dd)
string projectId = "game-undercover-d70dd";
FirestoreDb firestoreDb = FirestoreDb.Create(projectId);
builder.Services.AddSingleton(firestoreDb);

// Thêm FriendService và Firebase Realtime Database
builder.Services.AddScoped<ServerUndercover.Services.FriendService>();
builder.Services.AddSingleton(new Firebase.Database.FirebaseClient("https://game-undercover-d70dd-default-rtdb.firebaseio.com/"));


// 4. Cấu hình Firebase
var config = new FirebaseAuthConfig
{
    ApiKey = "AIzaSyDjYibTklIP4LZHn5JleaQsY6ut5qzSfJs",
    AuthDomain = "game-undercover-d70dd.firebaseapp.com",
    Providers = new FirebaseAuthProvider[] { new EmailProvider() }
};
var authClient = new FirebaseAuthClient(config);
builder.Services.AddSingleton<FirebaseAuthClient>(authClient);
builder.Services.AddHttpClient();// Thêm HttpClient để UserService có thể gọi FirebaseAuthClient


// ============ GIAI ĐOẠN 2: KHỞI TẠO ỨNG DỤNG ============
var app = builder.Build();


// ============ GIAI ĐOẠN 3: CẤU HÌNH PIPELINE (APP) ============

// Bật Swagger UI
app.UseSwagger();
app.UseSwaggerUI();

// Bật CORS (Bắt buộc phải đứng TRƯỚC MapControllers và MapHub)
app.UseCors("AllowNextJs");

// Bật Authentication và Authorization (Lưu ý: phải đứng TRƯỚC MapControllers/MapHub)
app.UseAuthentication();
app.UseAuthorization();

// Map các đường dẫn
app.MapControllers();
app.MapHub<ServerUndercover.Hubs.GameHub>("/gamehub");
app.MapHub<ServerUndercover.Hubs.SessionHub>("/sessionhub");

// Chạy Server (Chỉ có 1 lệnh Run duy nhất ở cuối file)
app.Run();